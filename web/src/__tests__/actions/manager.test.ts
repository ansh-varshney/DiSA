import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb, FIXTURES } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')
vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
}))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendNotification, sendNotifications, notifyAdmins } from '@/actions/notifications'

import {
    updateBookingStatus,
    rejectWithReason,
    endSession,
    emergencyEndSession,
    expireBooking,
    reportStudentPostSession,
    reportLostEquipment,
    getBookingDetails,
} from '@/actions/manager'

// ─── Shared mock scaffolding ──────────────────────────────────────────────────

function makeAuthDb() {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'manager-1' } } })
    return db
}

/** Build a chainable chain that resolves to `res` on any terminal call */
function chain(res: any = { data: null, error: null }) {
    const c: any = {}
    for (const m of ['select','insert','update','delete','eq','neq','in','not','or',
                      'gte','lte','lt','gt','ilike','order','limit','single']) {
        c[m] = vi.fn().mockReturnValue(c)
    }
    c.single = vi.fn().mockResolvedValue(res)
    c.then = (resolve: any) => Promise.resolve(res).then(resolve)
    return c
}

// ─── updateBookingStatus ───────────────────────────────────────────────────────

describe('updateBookingStatus', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns success on valid status change', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn(() => chain())
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        const result = await updateBookingStatus('b-1', 'confirmed')
        expect(result).toEqual({ success: true })
    })

    it('returns error when DB update fails', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn(() => chain({ data: null, error: { message: 'constraint violation' } }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateBookingStatus('b-1', 'confirmed')
        expect(result).toEqual({ error: 'constraint violation' })
    })

    it('sends N5 (session active) to all confirmed players when status → active', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn(() => chain())
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // getBookingForNotif
        adminDb.mockTableOnce('bookings', {
            data: {
                id: 'b-1',
                start_time: FIXTURES.booking.start_time,
                user_id: 'student-1',
                courts: { name: 'Ct A', sport: 'badminton' },
            },
            error: null,
        })
        // getBookingStudentIds — bookings query
        adminDb.mockTableOnce('bookings', {
            data: { user_id: 'student-1', players_list: [{ id: 'student-2', status: 'confirmed' }] },
            error: null,
        })
        // getBookingStudentIds — profiles query
        adminDb.mockTableOnce('profiles', {
            data: [{ id: 'student-1' }, { id: 'student-2' }],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await updateBookingStatus('b-1', 'active')
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'booking_session_active' }),
            ]),
        )
    })

    it('frees equipment when status is terminal (cancelled/rejected/completed)', async () => {
        const db = makeAuthDb()
        const equipChain = chain()
        const equipUpdateSpy = vi.fn().mockReturnValue(equipChain)
        db.client.from = vi.fn((table: string) => {
            if (table === 'equipment') return { ...equipChain, update: equipUpdateSpy }
            return chain({ data: { equipment_ids: ['eq-1'] }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await updateBookingStatus('b-1', 'cancelled')
        expect(equipUpdateSpy).toHaveBeenCalled()
    })
})

// ─── rejectWithReason ─────────────────────────────────────────────────────────

describe('rejectWithReason', () => {
    beforeEach(() => vi.clearAllMocks())

    it('cancels booking and issues violations to student players', async () => {
        const db = makeAuthDb()
        const insertSpy = vi.fn().mockReturnThis()
        // profiles queried twice: (1) requireManagerRole, (2) player role filter
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 'student-1', role: 'student' }], error: null })
            }
            const c = chain()
            if (table === 'student_violations') c.insert = insertSpy
            return c
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // getBookingForNotif (N6)
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 'student-1', courts: { name: 'Ct A', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await rejectWithReason('b-1', 'improper_gear', null, ['student-1'])
        expect(result).toEqual({ success: true })
        // Points deducted via RPC
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', expect.objectContaining({ p_delta: -4 }))
    })

    it('deducts correct points per rejection reason', async () => {
        const cases: [string, number][] = [
            ['students_late', -6],
            ['inappropriate_behaviour', -8],
            ['improper_gear', -4],
            ['other', 0],
        ]

        for (const [reason, expectedDelta] of cases) {
            vi.clearAllMocks()
            const db = makeAuthDb()
            // profiles queried twice: (1) requireManagerRole, (2) player role filter
            let profilesCount = 0
            db.client.from = vi.fn((table: string) => {
                if (table === 'profiles') {
                    return ++profilesCount === 1
                        ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                        : chain({ data: [{ id: 'student-1', role: 'student' }], error: null })
                }
                return chain()
            })
            vi.mocked(createClient).mockResolvedValue(db.client as any)

            const adminDb = makeMockDb()
            adminDb.mockTableOnce('bookings', {
                data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 'student-1', courts: { name: 'Ct A', sport: 'badminton' } },
                error: null,
            })
            vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

            await rejectWithReason('b-1', reason, null, ['student-1'])

            if (expectedDelta !== 0) {
                expect(adminDb.rpc).toHaveBeenCalledWith(
                    'update_student_points',
                    expect.objectContaining({ p_delta: expectedDelta }),
                )
            } else {
                expect(adminDb.rpc).not.toHaveBeenCalledWith('update_student_points', expect.anything())
            }
        }
    })

    it('checks for 14-day ban after students_late rejection', async () => {
        const db = makeAuthDb()
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 'student-1', role: 'student' }], error: null })
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 'student-1', courts: { name: 'Ct A', sport: 'badminton' } },
            error: null,
        })
        // check_and_apply_late_ban returns true → student is newly banned
        adminDb.rpc
            .mockResolvedValueOnce({ data: null, error: null }) // update_student_points
            .mockResolvedValueOnce({ data: true, error: null }) // check_and_apply_late_ban
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await rejectWithReason('b-1', 'students_late', null, ['student-1'])

        // N16 ban notification must be sent
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'ban_applied', recipientId: 'student-1' }),
            ]),
        )
    })

    it('does NOT send ban notification when check_and_apply_late_ban returns false', async () => {
        const db = makeAuthDb()
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 'student-1', role: 'student' }], error: null })
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        adminDb.rpc
            .mockResolvedValueOnce({ data: null, error: null }) // points
            .mockResolvedValueOnce({ data: false, error: null }) // ban check
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await rejectWithReason('b-1', 'students_late', null, ['student-1'])

        const banCalls = vi.mocked(sendNotifications).mock.calls.flat()
        const banNotif = (banCalls as any[]).find?.((n: any) => n?.type === 'ban_applied')
        expect(banNotif).toBeUndefined()
    })

    it('does not issue violations to admin/manager role players', async () => {
        const db = makeAuthDb()
        const violationInsertSpy = vi.fn().mockReturnThis()
        // profiles queried twice: (1) requireManagerRole, (2) player role filter → only manager found
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 'manager-2', role: 'manager' }], error: null })
            }
            const c = chain()
            if (table === 'student_violations') c.insert = violationInsertSpy
            return c
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // getBookingForNotif — N6 skipped since studentIds is empty but still queried
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 'm2', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await rejectWithReason('b-1', 'students_late', null, ['manager-2'])
        expect(violationInsertSpy).not.toHaveBeenCalled()
    })

    it('sends N6 (booking_rejected) notification for all rejection reasons', async () => {
        const reasons = ['students_late', 'inappropriate_behaviour', 'improper_gear', 'other']

        for (const reason of reasons) {
            vi.clearAllMocks()
            const db = makeAuthDb()
            let profilesCount = 0
            db.client.from = vi.fn((table: string) => {
                if (table === 'profiles') {
                    return ++profilesCount === 1
                        ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                        : chain({ data: [{ id: 'student-1', role: 'student' }], error: null })
                }
                return chain()
            })
            vi.mocked(createClient).mockResolvedValue(db.client as any)

            const adminDb = makeMockDb()
            adminDb.mockTableOnce('bookings', {
                data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 'student-1', courts: { name: 'Ct A', sport: 'badminton' } },
                error: null,
            })
            vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

            await rejectWithReason('b-1', reason, null, ['student-1'])

            expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ type: 'booking_rejected', recipientId: 'student-1' }),
                ]),
            )
        }
    })
})

// ─── endSession ───────────────────────────────────────────────────────────────

describe('endSession', () => {
    beforeEach(() => vi.clearAllMocks())

    it('awards +10 pts (base 8 + good equipment +2) for clean session', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain({ data: { total_usage_count: 5 }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // getBookingStudentIds
        adminDb.mockTableOnce('bookings', {
            data: { user_id: 'student-1', players_list: [] },
            error: null,
        })
        adminDb.mockTableOnce('profiles', { data: [{ id: 'student-1' }], error: null })
        // getBookingForNotif
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 'student-1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])

        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 'student-1',
            p_delta: 10, // 8 base + 2 good
        })
    })

    it('awards +7 pts (base 8 - 1 minor damage) for minor damage', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain({ data: { total_usage_count: 0 }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', { data: { user_id: 's1', players_list: [] }, error: null })
        adminDb.mockTableOnce('profiles', { data: [{ id: 's1' }], error: null })
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await endSession('b-1', [{ id: 'eq-1', condition: 'minor_damage' }])
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', { p_student_id: 's1', p_delta: 7 })
    })

    it('does NOT call points RPC for damaged equipment (delta=0 is skipped)', async () => {
        /**
         * base 8 + damaged penalty -8 = 0
         * applyPoints() early-returns when delta===0 — no RPC call expected
         */
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain({ data: { total_usage_count: 0 }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', { data: { user_id: 's1', players_list: [] }, error: null })
        adminDb.mockTableOnce('profiles', { data: [{ id: 's1' }], error: null })
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await endSession('b-1', [{ id: 'eq-1', condition: 'damaged' }])
        // applyPoints skips when delta===0, so RPC must not be called
        expect(adminDb.rpc).not.toHaveBeenCalledWith('update_student_points', expect.anything())
    })

    it('sends N10 session_ended notification with correct points message', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain({ data: { total_usage_count: 0 }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', { data: { user_id: 's1', players_list: [] }, error: null })
        adminDb.mockTableOnce('profiles', { data: [{ id: 's1' }], error: null })
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's1', courts: { name: 'Badminton Court A', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'session_ended',
                    recipientId: 's1',
                    body: expect.stringContaining('+10 pts'),
                }),
            ]),
        )
    })

    it('uses atomic RPC for points — does NOT do read-modify-write', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            // bookings returns an active status so idempotency check passes; equipment returns usage count
            return chain({ data: { status: 'active', total_usage_count: 0 }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: { user_id: 's1', players_list: [{ id: 's2', status: 'confirmed' }] },
            error: null,
        })
        adminDb.mockTableOnce('profiles', { data: [{ id: 's1' }, { id: 's2' }], error: null })
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])

        // Must use RPC, not direct update on profiles.points
        const updateCalls = (adminDb.client.from as any).mock.calls
            .map((c: any[]) => c[0])
            .filter((t: string) => t === 'profiles')
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', expect.anything())
        // profiles table should NOT be updated directly (only selected)
        // rpc is called once per student
        expect(adminDb.rpc).toHaveBeenCalledTimes(2) // s1 and s2
    })
})

// ─── emergencyEndSession ──────────────────────────────────────────────────────

describe('emergencyEndSession', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns error when not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await emergencyEndSession('b-1', 'fight')).toEqual({ error: 'Unauthorized' })
    })

    it('marks booking completed and notifies players + admins', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', { data: { equipment_ids: [] }, error: null })
        adminDb.mockTableOnce('bookings', { data: { user_id: 's1', players_list: [] }, error: null })
        adminDb.mockTableOnce('profiles', { data: [{ id: 's1' }], error: null })
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        // notifyAdmins profiles query
        adminDb.mockTableOnce('profiles', { data: [{ id: 'admin-1' }], error: null })
        adminDb.mockTableOnce('notifications', { data: [{}], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await emergencyEndSession('b-1', 'fight broke out')
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'session_ended_emergency' })]),
        )
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'emergency_alert' }),
        )
    })
})

// ─── reportStudentPostSession ─────────────────────────────────────────────────

describe('reportStudentPostSession', () => {
    beforeEach(() => vi.clearAllMocks())

    const postCases: [string, number][] = [
        ['late_end', -4],
        ['inappropriate_behaviour', -8],
        ['vandalism', -15],
        ['other', 0],
    ]

    for (const [reason, delta] of postCases) {
        it(`deducts ${delta} pts for reason: ${reason}`, async () => {
            const db = makeAuthDb()
            db.client.from = vi.fn((table: string) => {
                if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                return chain()
            })
            vi.mocked(createClient).mockResolvedValue(db.client as any)

            const adminDb = makeMockDb()
            // reportStudentPostSession checks the target user's role via adminSupabase
            adminDb.mockTableOnce('profiles', { data: { role: 'student' }, error: null })
            vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)
            vi.mocked(sendNotification).mockResolvedValue('n-1')

            await reportStudentPostSession('b-1', 'student-1', reason, null)

            if (delta !== 0) {
                expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', {
                    p_student_id: 'student-1',
                    p_delta: delta,
                })
            } else {
                expect(adminDb.rpc).not.toHaveBeenCalled()
            }
        })
    }

    it('sends N13 violation notification to the specific student only', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // reportStudentPostSession checks the target user's role via adminSupabase
        adminDb.mockTableOnce('profiles', { data: { role: 'student' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await reportStudentPostSession('b-1', 'student-42', 'vandalism', 'broke the net')
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientId: 'student-42',
                type: 'violation_issued',
                body: expect.stringContaining('broke the net'),
            }),
        )
    })
})

// ─── reportLostEquipment ──────────────────────────────────────────────────────

describe('reportLostEquipment', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns error when not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await reportLostEquipment('b-1', ['eq-1'], ['s-1'])).toEqual({ error: 'Unauthorized' })
    })

    it('marks lost equipment as unavailable with condition=lost', async () => {
        const db = makeAuthDb()
        const updateSpy = vi.fn().mockReturnThis()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            const c = chain()
            if (table === 'equipment') c.update = updateSpy
            return c
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTable('profiles', { data: [{ id: 's-1' }], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await reportLostEquipment('b-1', ['eq-1'], ['s-1'])
        // update must be called on equipment with is_available:false, condition:'lost'
        expect(updateSpy).toHaveBeenCalledWith(
            expect.objectContaining({ is_available: false, condition: 'lost' }),
        )
    })

    it('deducts -20 pts per student via atomic RPC', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTable('profiles', { data: [{ id: 's-1' }, { id: 's-2' }], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await reportLostEquipment('b-1', ['eq-1'], ['s-1', 's-2'])
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', { p_student_id: 's-1', p_delta: -20 })
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', { p_student_id: 's-2', p_delta: -20 })
    })

    it('sends N14 to student players AND N21 to admins', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTable('profiles', { data: [{ id: 's-1' }], error: null })
        // notifyAdmins profiles query + notifications insert
        adminDb.mockTableOnce('profiles', { data: [{ id: 'admin-1' }], error: null })
        adminDb.mockTableOnce('notifications', { data: [{}], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await reportLostEquipment('b-1', ['eq-1'], ['s-1'])
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'equipment_lost', recipientId: 's-1' })]),
        )
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'equipment_incident' }),
        )
    })
})

// ─── expireBooking ────────────────────────────────────────────────────────────

describe('expireBooking', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns already_handled when booking is not pending', async () => {
        const db = makeAuthDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain({ data: { status: 'active' }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await expireBooking('b-1', ['s-1'])
        expect(result).toEqual({ already_handled: true })
    })

    it('cancels booking, issues violations, sends N7 notifications', async () => {
        const db = makeAuthDb()
        let bookingCallCount = 0
        // profiles queried twice: (1) requireManagerRole, (2) player role filter
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 's-1', role: 'student' }], error: null })
            }
            if (table === 'bookings') {
                bookingCallCount++
                if (bookingCallCount === 1)
                    return chain({ data: { status: 'pending_confirmation' }, error: null })
                return chain({ data: { equipment_ids: [] }, error: null })
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // getBookingForNotif uses admin client
        adminDb.mockTableOnce('bookings', {
            data: { id: 'b-1', start_time: FIXTURES.booking.start_time, user_id: 's-1', courts: { name: 'Ct', sport: 'badminton' } },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await expireBooking('b-1', ['s-1'])
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_expired' })]),
        )
    })
})

// ─── getBookingDetails (lazy expiry) ──────────────────────────────────────────

describe('getBookingDetails — lazy expiry', () => {
    beforeEach(() => vi.clearAllMocks())

    /** A start time safely in the past (> 10 min ago) to trigger expiry */
    const EXPIRED_START = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    /** A start time in the future — never triggers expiry */
    const FUTURE_START = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    it('returns booking data without triggering expiry when status is active (even if past start)', async () => {
        const db = makeMockDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'bookings')
                return chain({
                    data: {
                        id: 'b-1',
                        status: 'active',
                        start_time: EXPIRED_START,
                        user_id: 's-1',
                        equipment_ids: [],
                        players_list: [],
                        profiles: { id: 's-1', full_name: 'Alice' },
                        courts: { name: 'Ct A', sport: 'badminton' },
                    },
                    error: null,
                })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingDetails('b-1')
        // Should return the booking without cancelling it
        expect(result).not.toBeNull()
        expect(result?.status).toBe('active')
        // No admin client needed — no expiry path executed
        expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
    })

    it('returns booking normally when pending but start time is in the future', async () => {
        const db = makeMockDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'bookings')
                return chain({
                    data: {
                        id: 'b-2',
                        status: 'waiting_manager',
                        start_time: FUTURE_START,
                        user_id: 's-1',
                        equipment_ids: [],
                        players_list: [],
                        profiles: { id: 's-1', full_name: 'Bob' },
                        courts: { name: 'Ct B', sport: 'tennis' },
                    },
                    error: null,
                })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingDetails('b-2')
        expect(result).not.toBeNull()
        expect(result?.status).toBe('waiting_manager')
        expect(vi.mocked(createAdminClient)).not.toHaveBeenCalled()
    })

    it('auto-cancels expired pending_confirmation booking, issues violations via admin client, and returns status: cancelled', async () => {
        const db = makeMockDb()
        let bookingsCallCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'bookings') {
                bookingsCallCount++
                if (bookingsCallCount === 1)
                    // initial fetch
                    return chain({
                        data: {
                            id: 'b-3',
                            status: 'pending_confirmation',
                            start_time: EXPIRED_START,
                            user_id: 's-1',
                            equipment_ids: [],
                            players_list: [],
                            profiles: { id: 's-1', full_name: 'Carol' },
                            courts: { name: 'Ct C', sport: 'squash' },
                        },
                        error: null,
                    })
                // freeBookingEquipment + cancel update
                return chain()
            }
            if (table === 'profiles')
                return chain({ data: [{ id: 's-1', role: 'student' }], error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        // applyPoints RPC
        adminDb.client.rpc = vi.fn().mockResolvedValue({ error: null })
        // getBookingForNotif
        adminDb.mockTableOnce('bookings', {
            data: {
                id: 'b-3',
                start_time: EXPIRED_START,
                user_id: 's-1',
                courts: { name: 'Ct C', sport: 'squash' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getBookingDetails('b-3')

        // Booking should be returned with status patched to 'cancelled'
        expect(result).not.toBeNull()
        expect(result?.status).toBe('cancelled')

        // Admin client must have been used (for violations + points)
        expect(vi.mocked(createAdminClient)).toHaveBeenCalled()

        // Should send expiry notifications
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_expired' })]),
        )
    })

    it('auto-cancels expired waiting_manager booking and returns status: cancelled', async () => {
        const db = makeMockDb()
        let bookingsCallCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'bookings') {
                bookingsCallCount++
                if (bookingsCallCount === 1)
                    return chain({
                        data: {
                            id: 'b-4',
                            status: 'waiting_manager',
                            start_time: EXPIRED_START,
                            user_id: 's-2',
                            equipment_ids: [],
                            players_list: [],
                            profiles: { id: 's-2', full_name: 'Dan' },
                            courts: { name: 'Ct D', sport: 'basketball' },
                        },
                        error: null,
                    })
                return chain()
            }
            if (table === 'profiles')
                return chain({ data: [{ id: 's-2', role: 'student' }], error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.client.rpc = vi.fn().mockResolvedValue({ error: null })
        adminDb.mockTableOnce('bookings', {
            data: {
                id: 'b-4',
                start_time: EXPIRED_START,
                user_id: 's-2',
                courts: { name: 'Ct D', sport: 'basketball' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getBookingDetails('b-4')
        expect(result?.status).toBe('cancelled')
    })
})
