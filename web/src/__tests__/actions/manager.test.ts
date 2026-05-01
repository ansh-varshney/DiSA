import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { getCurrentUser } from '@/lib/session'

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
}))

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BOOKING_NOTIF = {
    id: 'b-1',
    start_time: new Date('2025-01-15T10:00:00Z'),
    user_id: 'student-1',
    courts: { name: 'Ct A', sport: 'badminton' },
}

/**
 * Enqueue DB calls needed for requireManagerRole().
 * getCurrentUser() is globally mocked to return {id:'student-1'}.
 * We enqueue the role check result.
 */
function enqueueManagerRole(role = 'manager') {
    mockDrizzleDb.enqueue([{ role }])
}

/**
 * Enqueue DB calls for getBookingStudentIds(bookingId).
 * 2 pops: bookings select + profiles select.
 */
function enqueueBookingStudentIds(
    userId = 'student-1',
    playersList: any[] = [],
    studentIds = ['student-1']
) {
    mockDrizzleDb.enqueue([{ user_id: userId, players_list: playersList }])
    mockDrizzleDb.enqueue(studentIds.map((id) => ({ id })))
}

/**
 * Enqueue DB call for getBookingForNotif(bookingId).
 * 1 pop: bookings leftJoin courts select.
 */
function enqueueBookingForNotif(data = BOOKING_NOTIF) {
    mockDrizzleDb.enqueue([data])
}

// ─── updateBookingStatus ───────────────────────────────────────────────────────

describe('updateBookingStatus', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns success on valid status change (confirmed)', async () => {
        // status='confirmed' is not terminal and not active
        mockDrizzleDb.enqueueEmpty() // update bookings
        expect(await updateBookingStatus('b-1', 'confirmed')).toEqual({ success: true })
    })

    it('returns error when DB update throws', async () => {
        mockDrizzleDb.enqueueThrow('constraint violation')
        expect(await updateBookingStatus('b-1', 'confirmed')).toEqual({
            success: false,
            error: 'constraint violation',
        })
    })

    it('fetches equipment_ids before cancelling', async () => {
        // status='cancelled' is terminal
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // fetch equipment_ids
        mockDrizzleDb.enqueueEmpty() // update bookings
        // equipment_ids empty → no equipment update
        expect(await updateBookingStatus('b-1', 'cancelled')).toEqual({ success: true })
    })

    it('frees equipment when cancelling with equipment_ids', async () => {
        mockDrizzleDb.enqueue([{ equipment_ids: ['eq-1', 'eq-2'] }]) // fetch equipment_ids
        mockDrizzleDb.enqueueEmpty() // update bookings
        mockDrizzleDb.enqueueEmpty() // update equipment (free)
        expect(await updateBookingStatus('b-1', 'cancelled')).toEqual({ success: true })
    })

    it('sends session_active notifications when status → active', async () => {
        mockDrizzleDb.enqueueEmpty() // update bookings
        enqueueBookingForNotif() // getBookingForNotif
        enqueueBookingStudentIds() // getBookingStudentIds (2 pops)

        await updateBookingStatus('b-1', 'active')
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_session_active' })])
        )
    })
})

// ─── rejectWithReason ─────────────────────────────────────────────────────────

describe('rejectWithReason', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns error when not a manager', async () => {
        enqueueManagerRole('student')
        expect(await rejectWithReason('b-1', 'improper_gear', null, ['s-1'])).toEqual({
            error: 'Forbidden',
        })
    })

    it('returns success and issues violations to student players', async () => {
        enqueueManagerRole() // requireManagerRole role check
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // select equipment_ids
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)
        mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }]) // select profiles to filter students
        mockDrizzleDb.enqueueEmpty() // insert studentViolations
        // REJECTION_POINTS['improper_gear'] = -4, so applyPoints calls execute
        mockDrizzleDb.enqueueEmpty() // execute update_student_points
        enqueueBookingForNotif() // getBookingForNotif

        const result = await rejectWithReason('b-1', 'improper_gear', null, ['s-1'])
        expect(result).toEqual({ success: true })
    })

    it('deducts correct points per rejection reason', async () => {
        const cases: [string, boolean][] = [
            ['students_late', true], // -6, has execute
            ['inappropriate_behaviour', true], // -8, has execute
            ['improper_gear', true], // -4, has execute
            ['other', false], // 0, no execute
        ]

        for (const [reason, hasPoints] of cases) {
            mockDrizzleDb.reset()
            enqueueManagerRole()
            mockDrizzleDb.enqueue([{ equipment_ids: [] }])
            mockDrizzleDb.enqueueEmpty()
            mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }])
            mockDrizzleDb.enqueueEmpty() // insert violations
            if (hasPoints) {
                mockDrizzleDb.enqueueEmpty() // execute update_student_points
            }
            if (reason === 'students_late') {
                // check_and_apply_late_ban execute → no ban (null banned_until)
                mockDrizzleDb.enqueue([{ banned_until: null }])
            }
            enqueueBookingForNotif()

            const result = await rejectWithReason('b-1', reason, null, ['s-1'])
            expect(result).toEqual({ success: true })
        }
    })

    it('sends ban notification when check_and_apply_late_ban returns a date', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ equipment_ids: [] }])
        mockDrizzleDb.enqueueEmpty() // update bookings
        mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }])
        mockDrizzleDb.enqueueEmpty() // insert violations
        mockDrizzleDb.enqueueEmpty() // execute update_student_points (-6)
        // check_and_apply_late_ban returns a future date → banned
        mockDrizzleDb.enqueue([{ banned_until: '2025-02-01T00:00:00Z' }])
        enqueueBookingForNotif()

        await rejectWithReason('b-1', 'students_late', null, ['s-1'])

        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'ban_applied', recipientId: 's-1' }),
            ])
        )
    })

    it('does not send ban notification when check_and_apply_late_ban returns null', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ equipment_ids: [] }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueueEmpty() // execute update_student_points
        mockDrizzleDb.enqueue([{ banned_until: null }]) // no ban
        enqueueBookingForNotif()

        await rejectWithReason('b-1', 'students_late', null, ['s-1'])

        const banCalls = vi.mocked(sendNotifications).mock.calls.flat()
        expect(banCalls.some((n: any) => n?.type === 'ban_applied')).toBe(false)
    })

    it('does not issue violations to non-student players', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ equipment_ids: [] }])
        mockDrizzleDb.enqueueEmpty() // update bookings
        // profiles query returns manager role — not a student
        mockDrizzleDb.enqueue([{ id: 'manager-2', role: 'manager' }])
        // No violations insert, no points, no ban check
        enqueueBookingForNotif()

        await rejectWithReason('b-1', 'students_late', null, ['manager-2'])
        // booking_rejected notification should NOT be sent to non-students
        // (studentIds is empty)
        const calls = vi.mocked(sendNotifications).mock.calls
        expect(
            calls.every((args) =>
                (args[0] as any[]).every((n: any) => n.type !== 'booking_rejected')
            )
        ).toBe(true)
    })

    it('sends booking_rejected notification for all rejection reasons', async () => {
        const reasons = ['students_late', 'inappropriate_behaviour', 'improper_gear', 'other']

        for (const reason of reasons) {
            mockDrizzleDb.reset()
            vi.clearAllMocks()
            enqueueManagerRole()
            mockDrizzleDb.enqueue([{ equipment_ids: [] }])
            mockDrizzleDb.enqueueEmpty()
            mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }])
            mockDrizzleDb.enqueueEmpty() // violations

            const hasPoints = [
                'students_late',
                'inappropriate_behaviour',
                'improper_gear',
            ].includes(reason)
            if (hasPoints) mockDrizzleDb.enqueueEmpty()
            if (reason === 'students_late') mockDrizzleDb.enqueue([{ banned_until: null }])

            enqueueBookingForNotif()

            await rejectWithReason('b-1', reason, null, ['s-1'])

            expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ type: 'booking_rejected', recipientId: 's-1' }),
                ])
            )
        }
    })
})

// ─── endSession ───────────────────────────────────────────────────────────────

describe('endSession', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('awards +10 pts (base 8 + good equipment +2) for clean session', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'b-1' }]) // update bookings .returning()
        mockDrizzleDb.enqueue([{ total_usage_count: 5 }]) // select equipment usage count
        mockDrizzleDb.enqueueEmpty() // update equipment condition
        enqueueBookingStudentIds('student-1', [], ['student-1'])
        mockDrizzleDb.enqueueEmpty() // execute update_student_points (+10)
        enqueueBookingForNotif()

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])

        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'session_ended',
                    recipientId: 'student-1',
                    body: expect.stringContaining('+10 pts'),
                }),
            ])
        )
    })

    it('awards +7 pts (base 8 - 1 minor damage) for minor damage', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'b-1' }]) // returning
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }])
        mockDrizzleDb.enqueueEmpty()
        enqueueBookingStudentIds('s1', [], ['s1'])
        mockDrizzleDb.enqueueEmpty() // execute update_student_points (+7)
        enqueueBookingForNotif({ ...BOOKING_NOTIF, user_id: 's1' })

        await endSession('b-1', [{ id: 'eq-1', condition: 'minor_damage' }])

        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ body: expect.stringContaining('+7 pts') }),
            ])
        )
    })

    it('does NOT call applyPoints for damaged equipment (delta=0)', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'b-1' }])
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }])
        mockDrizzleDb.enqueueEmpty()
        enqueueBookingStudentIds('s1', [], ['s1'])
        // delta = 8 + (-8) = 0 → applyPoints early-returns → no execute call
        enqueueBookingForNotif({ ...BOOKING_NOTIF, user_id: 's1' })

        const result = await endSession('b-1', [{ id: 'eq-1', condition: 'damaged' }])
        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.execute).not.toHaveBeenCalled()
    })

    it('returns already_handled when booking is already completed', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([]) // returning() → empty = nothing updated (already completed)

        expect(await endSession('b-1', [])).toEqual({ already_handled: true })
    })

    it('sends N10 session_ended notification', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'b-1' }])
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }])
        mockDrizzleDb.enqueueEmpty()
        enqueueBookingStudentIds('s1', [], ['s1'])
        mockDrizzleDb.enqueueEmpty() // execute points
        enqueueBookingForNotif({
            ...BOOKING_NOTIF,
            user_id: 's1',
            courts: { name: 'Badminton Court A', sport: 'badminton' },
        })

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'session_ended', recipientId: 's1' }),
            ])
        )
    })
})

// ─── emergencyEndSession ──────────────────────────────────────────────────────

describe('emergencyEndSession', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns error when not a manager', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
        expect(await emergencyEndSession('b-1', 'fight')).toEqual({ error: 'Unauthorized' })
    })

    it('marks booking completed and notifies players + admins', async () => {
        enqueueManagerRole()
        // freeBookingEquipment
        mockDrizzleDb.enqueue([{ equipment_ids: [] }])
        mockDrizzleDb.enqueueEmpty() // update bookings (completed)
        mockDrizzleDb.enqueueEmpty() // insert feedbackComplaints
        enqueueBookingStudentIds() // getBookingStudentIds
        enqueueBookingForNotif() // getBookingForNotif

        const result = await emergencyEndSession('b-1', 'fight broke out')
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'session_ended_emergency' })])
        )
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'emergency_alert' })
        )
    })
})

// ─── reportStudentPostSession ─────────────────────────────────────────────────

describe('reportStudentPostSession', () => {
    beforeEach(() => mockDrizzleDb.reset())

    const postCases: [string, boolean][] = [
        ['late_end', true],
        ['inappropriate_behaviour', true],
        ['vandalism', true],
        ['other', false],
    ]

    for (const [reason, hasPoints] of postCases) {
        it(`returns success for reason: ${reason}`, async () => {
            enqueueManagerRole()
            mockDrizzleDb.enqueue([{ role: 'student' }]) // check target user role
            mockDrizzleDb.enqueueEmpty() // insert violation
            if (hasPoints) {
                mockDrizzleDb.enqueueEmpty() // execute update_student_points
            }
            // sendNotification is mocked

            const result = await reportStudentPostSession('b-1', 'student-42', reason, null)
            expect(result).toEqual({ success: true })
        })
    }

    it('sends violation notification to the specific student only', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ role: 'student' }])
        mockDrizzleDb.enqueueEmpty() // insert violation
        mockDrizzleDb.enqueueEmpty() // execute points (vandalism = -15)

        await reportStudentPostSession('b-1', 'student-42', 'vandalism', 'broke the net')
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientId: 'student-42',
                type: 'violation_issued',
                body: expect.stringContaining('broke the net'),
            })
        )
    })

    it('returns error when target is not a student', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // target is a manager
        expect(await reportStudentPostSession('b-1', 'manager-1', 'vandalism', null)).toEqual({
            error: 'Target user is not a student',
        })
    })
})

// ─── reportLostEquipment ──────────────────────────────────────────────────────

describe('reportLostEquipment', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
        expect(await reportLostEquipment('b-1', ['eq-1'], ['s-1'])).toEqual({
            error: 'Unauthorized',
        })
    })

    it('marks lost equipment as unavailable with condition=lost', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'eq-1', name: 'Racket', equipment_id: 'E001' }]) // select equipment names
        mockDrizzleDb.enqueueEmpty() // update equipment (mark lost)
        mockDrizzleDb.enqueue([]) // select future bookings (none impacted)
        mockDrizzleDb.enqueueEmpty() // insert violations
        mockDrizzleDb.enqueue([{ id: 's-1' }]) // select student profiles
        mockDrizzleDb.enqueueEmpty() // execute update_student_points (-20)

        const result = await reportLostEquipment('b-1', ['eq-1'], ['s-1'])
        expect(result).toMatchObject({ success: true })
        expect(mockDrizzleDb.update).toHaveBeenCalled()
    })

    it('deducts -20 pts per student', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'eq-1', name: 'Racket', equipment_id: 'E001' }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([]) // no future bookings
        mockDrizzleDb.enqueueEmpty() // insert violations
        mockDrizzleDb.enqueue([{ id: 's-1' }, { id: 's-2' }]) // 2 students
        mockDrizzleDb.enqueueEmpty() // execute points s-1
        mockDrizzleDb.enqueueEmpty() // execute points s-2

        await reportLostEquipment('b-1', ['eq-1'], ['s-1', 's-2'])
        // execute called twice (once per student)
        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(2)
    })

    it('sends equipment_lost notifications and notifies admins', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ id: 'eq-1', name: 'Racket', equipment_id: 'E001' }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([{ id: 's-1' }])
        mockDrizzleDb.enqueueEmpty()

        await reportLostEquipment('b-1', ['eq-1'], ['s-1'])
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'equipment_lost', recipientId: 's-1' }),
            ])
        )
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'equipment_incident' })
        )
    })
})

// ─── expireBooking ────────────────────────────────────────────────────────────

describe('expireBooking', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns already_handled when booking is not pending', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ status: 'active' }]) // booking is active

        expect(await expireBooking('b-1', ['s-1'])).toEqual({ already_handled: true })
    })

    it('cancels booking, issues violations, sends booking_expired notifications', async () => {
        enqueueManagerRole()
        mockDrizzleDb.enqueue([{ status: 'pending_confirmation' }]) // booking check
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // freeBookingEquipment
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)
        mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }]) // profiles filter
        mockDrizzleDb.enqueueEmpty() // insert violations
        mockDrizzleDb.enqueueEmpty() // execute update_student_points (-8)
        enqueueBookingForNotif() // getBookingForNotif

        const result = await expireBooking('b-1', ['s-1'])
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_expired' })])
        )
    })
})

// ─── getBookingDetails — lazy expiry ──────────────────────────────────────────

describe('getBookingDetails — lazy expiry', () => {
    beforeEach(() => mockDrizzleDb.reset())

    const EXPIRED_START = new Date(Date.now() - 20 * 60 * 1000)
    const FUTURE_START = new Date(Date.now() + 60 * 60 * 1000)

    function makeBooking(overrides: any = {}) {
        return {
            id: 'b-1',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: FUTURE_START,
            end_time: new Date(FUTURE_START.getTime() + 3600000),
            status: 'confirmed',
            players_list: [],
            equipment_ids: [],
            is_maintenance: false,
            is_priority: false,
            num_players: 1,
            notes: null,
            created_at: new Date(),
            profiles: {
                id: 's-1',
                full_name: 'Alice',
                email: null,
                phone_number: null,
                student_id: null,
                role: 'student',
                branch: null,
                gender: null,
                year: null,
                points: 0,
                banned_until: null,
                avatar_url: null,
            },
            courts: { id: 'c-1', name: 'Ct A', sport: 'badminton' },
            ...overrides,
        }
    }

    it('returns booking without triggering expiry when status is active', async () => {
        const bk = makeBooking({ status: 'active', start_time: EXPIRED_START })
        mockDrizzleDb.enqueue([bk])
        // No freeBookingEquipment, no violations — equipment list fetch
        // equipment_ids empty → no equipment select
        // additionalPlayerIds empty → no profiles select

        const result = await getBookingDetails('b-1')
        expect(result).not.toBeNull()
        expect(result?.status).toBe('active')
    })

    it('returns booking normally when pending but start time is in future', async () => {
        const bk = makeBooking({ status: 'waiting_manager', start_time: FUTURE_START })
        mockDrizzleDb.enqueue([bk])

        const result = await getBookingDetails('b-1')
        expect(result?.status).toBe('waiting_manager')
    })

    it('auto-cancels expired pending_confirmation booking and returns status: cancelled', async () => {
        const bk = makeBooking({ status: 'pending_confirmation', start_time: EXPIRED_START })
        mockDrizzleDb.enqueue([bk]) // initial fetch
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // freeBookingEquipment
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)
        mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }]) // profiles for player ids
        mockDrizzleDb.enqueueEmpty() // insert violations
        mockDrizzleDb.enqueueEmpty() // execute update_student_points (-8)
        enqueueBookingForNotif() // getBookingForNotif

        const result = await getBookingDetails('b-1')
        expect(result?.status).toBe('cancelled')
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_expired' })])
        )
    })

    it('auto-cancels expired waiting_manager booking', async () => {
        const bk = makeBooking({ status: 'waiting_manager', start_time: EXPIRED_START })
        mockDrizzleDb.enqueue([bk])
        mockDrizzleDb.enqueue([{ equipment_ids: [] }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([{ id: 's-1', role: 'student' }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueueEmpty()
        enqueueBookingForNotif()

        const result = await getBookingDetails('b-1')
        expect(result?.status).toBe('cancelled')
    })

    it('returns null when booking not found', async () => {
        mockDrizzleDb.enqueue([]) // empty → bk is undefined
        expect(await getBookingDetails('nonexistent')).toBeNull()
    })
})
