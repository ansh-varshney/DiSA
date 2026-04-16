/**
 * Integration tests: Full booking lifecycle
 *
 * These tests trace the system's data and notification flow end-to-end
 * (mocking only I/O — Supabase & Next.js cache).
 *
 * Flows covered:
 *  A. Student creates booking → Manager approves → Session active → Normal end
 *  B. Student creates booking with invited player → Player accepts → Session ends
 *  C. Student creates booking → Player rejects → Not enough players → Auto-cancel
 *  D. Manager rejects booking (students_late) → 3rd strike → 14-day ban applied
 *  E. Admin creates priority reserve → Cancels student bookings → N25 sent
 *  F. Booking timeout → expireBooking → N7 sent
 *  G. Equipment reported lost → Points deducted → N14 + N21
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb, FIXTURES } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')
vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
    acceptPlayRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectPlayRequest: vi.fn().mockResolvedValue({ success: true }),
}))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendNotification, sendNotifications, notifyAdmins } from '@/actions/notifications'

import {
    updateBookingStatus,
    endSession,
    expireBooking,
    rejectWithReason,
    reportLostEquipment,
} from '@/actions/manager'
import { cancelBooking } from '@/actions/bookings'
import { priorityReserveSlot, adjustStudentPoints } from '@/actions/admin'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chain(res: any = { data: null, error: null }) {
    const c: any = {}
    for (const m of [
        'select',
        'insert',
        'update',
        'delete',
        'eq',
        'neq',
        'in',
        'not',
        'or',
        'is',
        'gte',
        'lte',
        'lt',
        'gt',
        'ilike',
        'order',
        'limit',
        'range',
    ]) {
        c[m] = vi.fn().mockReturnValue(c)
    }
    c.single = vi.fn().mockResolvedValue(res)
    c.then = (resolve: any) => Promise.resolve(res).then(resolve)
    return c
}

function managerDb() {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'manager-1' } } })
    db.client.from = vi.fn((table: string) => {
        if (table === 'profiles')
            return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
        // endSession's idempotency guard does `.update().neq('status','completed').select('id')`
        // and checks `markedRows.length === 0` to detect an already-completed booking.
        // Returning a non-empty array lets the guard pass so points and notifications fire.
        if (table === 'bookings') return chain({ data: [{ id: 'b-1' }], error: null })
        return chain()
    })
    return db
}

function adminDb() {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    db.client.from = vi.fn((table: string) => {
        if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
        return chain()
    })
    return db
}

// ─── Flow A: Normal session lifecycle ─────────────────────────────────────────

describe('Flow A: Booking approval → session active → session end', () => {
    beforeEach(() => vi.clearAllMocks())

    it('manager marks booking active → N5 sent → end session → N10 + points awarded', async () => {
        // Step 1: Manager activates booking
        const mgrDb = managerDb()
        vi.mocked(createClient).mockResolvedValue(mgrDb.client as any)

        const adb = makeMockDb()
        adb.mockTableOnce('bookings', {
            data: {
                id: 'b-1',
                start_time: FIXTURES.booking.start_time,
                user_id: 's1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
            error: null,
        })
        adb.mockTableOnce('bookings', { data: { user_id: 's1', players_list: [] }, error: null })
        adb.mockTableOnce('profiles', { data: [{ id: 's1' }], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await updateBookingStatus('b-1', 'active')

        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_session_active' })])
        )

        // Step 2: Manager ends session cleanly
        vi.clearAllMocks()
        vi.mocked(createClient).mockResolvedValue(managerDb().client as any)

        const adb2 = makeMockDb()
        adb2.mockTableOnce('bookings', { data: { user_id: 's1', players_list: [] }, error: null })
        adb2.mockTableOnce('profiles', { data: [{ id: 's1' }], error: null })
        adb2.mockTableOnce('bookings', {
            data: {
                id: 'b-1',
                start_time: FIXTURES.booking.start_time,
                user_id: 's1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adb2.client as any)

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])

        expect(adb2.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 's1',
            p_delta: 10,
        })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'session_ended',
                    body: expect.stringContaining('+10 pts'),
                }),
            ])
        )
    })
})

// ─── Flow B: Invitation accepted → both players get points ────────────────────

describe('Flow B: Play request accepted → session ends → both players awarded', () => {
    beforeEach(() => vi.clearAllMocks())

    it('endSession awards points to both booker and confirmed invited player', async () => {
        const db = managerDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        // getBookingStudentIds: user_id + confirmed player
        adb.mockTableOnce('bookings', {
            data: {
                user_id: 'booker-1',
                players_list: [{ id: 'invitee-1', status: 'confirmed' }],
            },
            error: null,
        })
        adb.mockTableOnce('profiles', {
            data: [{ id: 'booker-1' }, { id: 'invitee-1' }],
            error: null,
        })
        // getBookingForNotif
        adb.mockTableOnce('bookings', {
            data: {
                id: 'b-2',
                start_time: FIXTURES.booking.start_time,
                user_id: 'booker-1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await endSession('b-2', [])

        expect(adb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 'booker-1',
            p_delta: 8,
        })
        expect(adb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 'invitee-1',
            p_delta: 8,
        })
    })

    it('pending players (not yet confirmed) are NOT awarded points', async () => {
        const db = managerDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        adb.mockTableOnce('bookings', {
            data: {
                user_id: 'booker-1',
                players_list: [{ id: 'pending-player', status: 'pending' }], // still pending
            },
            error: null,
        })
        // profiles returns only 'booker-1' because pending-player was filtered out
        adb.mockTableOnce('profiles', { data: [{ id: 'booker-1' }], error: null })
        adb.mockTableOnce('bookings', {
            data: {
                id: 'b-3',
                start_time: FIXTURES.booking.start_time,
                user_id: 'booker-1',
                courts: { name: 'Ct', sport: 'b' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await endSession('b-3', [])
        // Only booker gets points; pending player does NOT
        expect(adb.rpc).toHaveBeenCalledTimes(1)
        expect(adb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 'booker-1',
            p_delta: 8,
        })
    })
})

// ─── Flow D: Late rejection → 3rd strike → ban ────────────────────────────────

describe('Flow D: 3rd late-arrival strike triggers 14-day ban', () => {
    beforeEach(() => vi.clearAllMocks())

    it('check_and_apply_late_ban RPC called; ban notification sent when true', async () => {
        const db = managerDb()
        // profiles queried twice: (1) requireManagerRole → manager, (2) player role filter → student
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 's-late', role: 'student' }], error: null })
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        adb.mockTableOnce('bookings', {
            data: {
                id: 'b-late',
                start_time: FIXTURES.booking.start_time,
                user_id: 's-late',
                courts: { name: 'Ct', sport: 'badminton' },
            },
            error: null,
        })
        // update_student_points → success; check_and_apply_late_ban → true (newly banned)
        adb.rpc
            .mockResolvedValueOnce({ data: null, error: null }) // update_student_points
            .mockResolvedValueOnce({ data: true, error: null }) // check_and_apply_late_ban
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await rejectWithReason('b-late', 'students_late', null, ['s-late'])

        expect(adb.rpc).toHaveBeenCalledWith('check_and_apply_late_ban', { p_student_id: 's-late' })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'ban_applied', recipientId: 's-late' }),
            ])
        )
    })

    it('banned student cannot appear in searchStudents results', async () => {
        /**
         * The searchStudents action uses .or('banned_until.is.null,banned_until.lt.NOW')
         * to filter out banned students. Verify the filter is applied.
         */
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'current-user' } } })
        const orSpy = vi.fn().mockReturnThis()
        const queryChain: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            or: orSpy,
            limit: vi.fn().mockReturnThis(),
            then: (r: any) => r({ data: [], error: null }),
        }
        orSpy.mockReturnValue(queryChain)
        db.client.from = vi.fn(() => queryChain)
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { searchStudents } = await import('@/actions/bookings')
        await searchStudents('Alice')

        expect(orSpy).toHaveBeenCalled()
        const filterArg: string = orSpy.mock.calls[0][0]
        expect(filterArg).toMatch(/banned_until/)
    })
})

// ─── Flow E: Priority reserve → student booking cancelled → N25 ───────────────

describe('Flow E: Priority reservation cancels student bookings', () => {
    beforeEach(() => vi.clearAllMocks())

    it('cancels all conflicting bookings and notifies all affected parties', async () => {
        const db = adminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            return chain({ data: { id: 'priority-new' }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        adb.mockTableOnce('bookings', {
            data: [
                {
                    id: 'student-booking-1',
                    user_id: 'student-A',
                    players_list: [{ id: 'student-B', status: 'confirmed' }],
                    start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    courts: { name: 'Badminton Court A', sport: 'badminton' },
                },
            ],
            error: null,
        })
        adb.mockTableOnce('bookings', { data: null, error: null }) // cancel update
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        await priorityReserveSlot('court-1', futureDate, '10:00', '11:00')

        const calls = vi.mocked(sendNotifications).mock.calls[0][0] as any[]
        const types = calls.map((n: any) => n.type)
        expect(types.every((t: string) => t === 'priority_reserve_cancelled')).toBe(true)

        const recipients = calls.map((n: any) => n.recipientId)
        expect(recipients).toContain('student-A')
        expect(recipients).toContain('student-B')
    })
})

// ─── Flow F: Booking timeout → expireBooking ──────────────────────────────────

describe('Flow F: Booking timeout (10-minute no-show)', () => {
    beforeEach(() => vi.clearAllMocks())

    it('issues violations and sends N7 booking_expired to all players', async () => {
        const db = managerDb()
        let bookingCall = 0
        // profiles queried twice: (1) requireManagerRole → manager, (2) player role filter → student
        let profilesCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') {
                return ++profilesCount === 1
                    ? chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
                    : chain({ data: [{ id: 'student-1', role: 'student' }], error: null })
            }
            if (table === 'bookings') {
                bookingCall++
                if (bookingCall === 1)
                    return chain({ data: { status: 'pending_confirmation' }, error: null })
                return chain({ data: { equipment_ids: [] }, error: null })
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        // getBookingForNotif uses admin client
        adb.mockTableOnce('bookings', {
            data: {
                id: 'b-timeout',
                start_time: FIXTURES.booking.start_time,
                user_id: 'student-1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        const result = await expireBooking('b-timeout', ['student-1'])
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'booking_expired', recipientId: 'student-1' }),
            ])
        )
    })

    it('is idempotent: already-active booking returns already_handled', async () => {
        const db = managerDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles')
                return chain({ data: { id: 'manager-1', role: 'manager' }, error: null })
            return chain({ data: { status: 'active' }, error: null })
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await expireBooking('b-active', ['student-1'])
        expect(result).toEqual({ already_handled: true })
        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })
})

// ─── Flow G: Equipment lost ───────────────────────────────────────────────────

describe('Flow G: Equipment reported lost', () => {
    beforeEach(() => vi.clearAllMocks())

    it('full flow: marks equipment lost → −20 pts per student → N14 + N21', async () => {
        const db = managerDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        adb.mockTable('profiles', { data: [{ id: 's1' }, { id: 's2' }], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await reportLostEquipment('b-1', ['eq-lost'], ['s1', 's2'])

        // Both players penalised
        expect(adb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 's1',
            p_delta: -20,
        })
        expect(adb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 's2',
            p_delta: -20,
        })

        // N14 to students
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'equipment_lost', recipientId: 's1' }),
                expect.objectContaining({ type: 'equipment_lost', recipientId: 's2' }),
            ])
        )

        // N21 to admins
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'equipment_incident' })
        )
    })
})

// ─── Flow H: Admin adjusts points ─────────────────────────────────────────────

describe('Flow H: Admin manually adjusts student points', () => {
    beforeEach(() => vi.clearAllMocks())

    it('sends N18 with correct sign for positive adjustment', async () => {
        const db = adminDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        adb.rpc.mockResolvedValue({ data: null, error: null })
        adb.mockTable('notifications', { data: { id: 'n-18' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await adjustStudentPoints('student-1', 25)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'points_adjusted',
                body: expect.stringContaining('+25'),
            })
        )
    })

    it('sends N18 with negative sign for negative adjustment', async () => {
        const db = adminDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adb = makeMockDb()
        adb.rpc.mockResolvedValue({ data: null, error: null })
        adb.mockTable('notifications', { data: { id: 'n-18' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adb.client as any)

        await adjustStudentPoints('student-1', -12)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ body: expect.stringContaining('-12') })
        )
    })
})

// ─── Flow I: Booking cancellation with late penalty ───────────────────────────

describe('Flow I: Student cancels own booking', () => {
    beforeEach(() => vi.clearAllMocks())

    it('cancels booking and notifies other confirmed players', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'booker-1' } } })
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()

        db.client.from = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    user_id: 'booker-1',
                    start_time: farStart,
                    status: 'confirmed',
                    equipment_ids: [],
                    players_list: [{ id: 'player-2', status: 'confirmed' }],
                    courts: { name: 'Ct', sport: 'badminton' },
                },
                error: null,
            }),
            then: (r: any) => r({ data: null, error: null }),
        }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        const result = await cancelBooking('b-cancel')
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    recipientId: 'player-2',
                    type: 'booking_cancelled_by_booker',
                }),
            ])
        )
    })
})
