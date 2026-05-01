/**
 * Integration tests: Full booking lifecycle
 *
 * Traces the system's data and notification flow end-to-end,
 * mocking only I/O (Drizzle DB + Next.js cache).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'

vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
    acceptPlayRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectPlayRequest: vi.fn().mockResolvedValue({ success: true }),
}))

import { sendNotification, sendNotifications, notifyAdmins } from '@/actions/notifications'
import {
    updateBookingStatus,
    endSession,
    expireBooking,
    rejectWithReason,
    reportLostEquipment,
} from '@/actions/manager'
import { cancelBooking, searchStudents } from '@/actions/bookings'
import { priorityReserveSlot, adjustStudentPoints } from '@/actions/admin'

const START_TIME = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

// ─── Flow A: Normal session lifecycle ─────────────────────────────────────────

describe('Flow A: Booking approval → session active → session end', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotification).mockResolvedValue('notif-new')
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('manager marks booking active → N5 sent → end session → N10 + points awarded', async () => {
        // Step 1: updateBookingStatus('b-1', 'active') — no requireManagerRole
        mockDrizzleDb.enqueueEmpty() // update bookings
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                start_time: START_TIME,
                user_id: 's1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ]) // getBookingForNotif
        mockDrizzleDb.enqueue([{ user_id: 's1', players_list: [] }]) // getBookingStudentIds: booking
        mockDrizzleDb.enqueue([{ id: 's1' }]) // getBookingStudentIds: profiles

        await updateBookingStatus('b-1', 'active')

        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'booking_session_active' })])
        )

        // Step 2: endSession with 1 piece of good equipment → delta = 8 + 2 = 10 pts
        mockDrizzleDb.reset()
        vi.mocked(sendNotification).mockResolvedValue('notif-new')
        vi.mocked(sendNotifications).mockResolvedValue(undefined)

        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ id: 'b-1' }]) // update.returning() idempotency guard
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }]) // select equipment
        mockDrizzleDb.enqueueEmpty() // update equipment
        mockDrizzleDb.enqueue([{ user_id: 's1', players_list: [] }]) // getBookingStudentIds: booking
        mockDrizzleDb.enqueue([{ id: 's1' }]) // getBookingStudentIds: profiles
        mockDrizzleDb.enqueueEmpty() // applyPoints execute (delta=10)
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                start_time: START_TIME,
                user_id: 's1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ]) // getBookingForNotif

        await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])

        expect(mockDrizzleDb.execute).toHaveBeenCalled()
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
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotification).mockResolvedValue('notif-new')
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('endSession awards points to both booker and confirmed invited player', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ id: 'b-2' }]) // update.returning()
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // freeBookingEquipment: select
        mockDrizzleDb.enqueue([
            { user_id: 'booker-1', players_list: [{ id: 'invitee-1', status: 'confirmed' }] },
        ]) // getBookingStudentIds: booking
        mockDrizzleDb.enqueue([{ id: 'booker-1' }, { id: 'invitee-1' }]) // getBookingStudentIds: profiles
        mockDrizzleDb.enqueueEmpty() // applyPoints execute for booker-1
        mockDrizzleDb.enqueueEmpty() // applyPoints execute for invitee-1
        mockDrizzleDb.enqueue([
            {
                id: 'b-2',
                start_time: START_TIME,
                user_id: 'booker-1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ]) // getBookingForNotif

        await endSession('b-2', [])

        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(2)
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'session_ended', recipientId: 'booker-1' }),
                expect.objectContaining({ type: 'session_ended', recipientId: 'invitee-1' }),
            ])
        )
    })

    it('pending players (not yet confirmed) are NOT awarded points', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ id: 'b-3' }]) // update.returning()
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // freeBookingEquipment: select
        // pending player excluded: extraIds filtered by status !== 'confirmed'
        mockDrizzleDb.enqueue([
            { user_id: 'booker-1', players_list: [{ id: 'pending-player', status: 'pending' }] },
        ]) // getBookingStudentIds: booking
        mockDrizzleDb.enqueue([{ id: 'booker-1' }]) // getBookingStudentIds: profiles (booker only)
        mockDrizzleDb.enqueueEmpty() // applyPoints execute for booker only
        mockDrizzleDb.enqueue([
            {
                id: 'b-3',
                start_time: START_TIME,
                user_id: 'booker-1',
                courts: { name: 'Ct', sport: 'b' },
            },
        ]) // getBookingForNotif

        await endSession('b-3', [])

        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(1)
    })
})

// ─── Flow D: Late rejection → 3rd strike → ban ────────────────────────────────

describe('Flow D: 3rd late-arrival strike triggers 14-day ban', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('check_and_apply_late_ban execute called; ban notification sent when result is non-null', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // select booking equipment_ids
        mockDrizzleDb.enqueueEmpty() // update bookings cancel
        mockDrizzleDb.enqueue([{ id: 's-late', role: 'student' }]) // select profiles filter
        mockDrizzleDb.enqueueEmpty() // insert studentViolations
        mockDrizzleDb.enqueueEmpty() // applyPoints execute (delta=-6)
        mockDrizzleDb.enqueue([{ banned_until: '2026-05-07T00:00:00.000Z' }]) // check_and_apply_late_ban execute
        mockDrizzleDb.enqueue([
            {
                id: 'b-late',
                start_time: START_TIME,
                user_id: 's-late',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ]) // getBookingForNotif

        await rejectWithReason('b-late', 'students_late', null, ['s-late'])

        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(2)
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'ban_applied', recipientId: 's-late' }),
            ])
        )
    })

    it('searchStudents filters out banned students via Drizzle where clause', async () => {
        mockDrizzleDb.enqueue([{ id: 's-ok', full_name: 'Alice', banned_until: null }])

        const result = await searchStudents('Alice')

        expect(Array.isArray(result)).toBe(true)
        expect(result).toHaveLength(1)
        expect((result as any[])[0].id).toBe('s-ok')
    })
})

// ─── Flow E: Priority reserve → student booking cancelled → N25 ───────────────

describe('Flow E: Priority reservation cancels student bookings', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('cancels all conflicting bookings and notifies all affected parties', async () => {
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
        const futureDateStr = futureDate.toISOString().split('T')[0]

        mockDrizzleDb.enqueue([{ role: 'admin' }]) // verifyAdmin
        mockDrizzleDb.enqueue([
            {
                id: 'student-booking-1',
                user_id: 'student-A',
                players_list: [{ id: 'student-B', status: 'confirmed' }],
                start_time: futureDate.toISOString(),
                courts: { name: 'Badminton Court A', sport: 'badminton' },
            },
        ]) // select conflicting bookings
        mockDrizzleDb.enqueueEmpty() // update cancel conflicting
        mockDrizzleDb.enqueue([{ id: 'priority-new', court_id: 'court-1' }]) // insert.returning()

        await priorityReserveSlot('court-1', futureDateStr, '10:00', '11:00')

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
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('issues violations and sends booking_expired to all players', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ status: 'pending_confirmation' }]) // select booking status
        mockDrizzleDb.enqueue([{ equipment_ids: [] }]) // freeBookingEquipment: select
        mockDrizzleDb.enqueueEmpty() // update bookings cancel
        mockDrizzleDb.enqueue([{ id: 'student-1', role: 'student' }]) // select profiles filter
        mockDrizzleDb.enqueueEmpty() // insert studentViolations
        mockDrizzleDb.enqueueEmpty() // applyPoints execute (delta=-8)
        mockDrizzleDb.enqueue([
            {
                id: 'b-timeout',
                start_time: START_TIME,
                user_id: 'student-1',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ]) // getBookingForNotif

        const result = await expireBooking('b-timeout', ['student-1'])

        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'booking_expired', recipientId: 'student-1' }),
            ])
        )
    })

    it('is idempotent: already-active booking returns already_handled', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ status: 'active' }]) // select booking status → active

        const result = await expireBooking('b-active', ['student-1'])

        expect(result).toEqual({ already_handled: true })
        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })
})

// ─── Flow G: Equipment lost ───────────────────────────────────────────────────

describe('Flow G: Equipment reported lost', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
        vi.mocked(notifyAdmins).mockResolvedValue(undefined)
    })

    it('full flow: marks equipment lost → −20 pts per student → N14 + N21', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }]) // requireManagerRole
        mockDrizzleDb.enqueue([{ id: 'eq-lost', name: 'Shuttle', equipment_id: 'SH001' }]) // select equipment names
        mockDrizzleDb.enqueueEmpty() // update equipment (lost)
        mockDrizzleDb.enqueue([]) // select future bookings (empty → no impacted)
        mockDrizzleDb.enqueueEmpty() // insert studentViolations
        mockDrizzleDb.enqueue([{ id: 's1' }, { id: 's2' }]) // select student profiles
        mockDrizzleDb.enqueueEmpty() // applyPoints execute for s1
        mockDrizzleDb.enqueueEmpty() // applyPoints execute for s2

        await reportLostEquipment('b-1', ['eq-lost'], ['s1', 's2'])

        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(2)
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'equipment_lost', recipientId: 's1' }),
                expect.objectContaining({ type: 'equipment_lost', recipientId: 's2' }),
            ])
        )
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'equipment_incident' })
        )
    })
})

// ─── Flow H: Admin adjusts points ─────────────────────────────────────────────

describe('Flow H: Admin manually adjusts student points', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotification).mockResolvedValue('notif-new')
    })

    it('sends N18 with correct sign for positive adjustment', async () => {
        mockDrizzleDb.enqueue([{ role: 'admin' }]) // verifyAdmin
        mockDrizzleDb.enqueueEmpty() // db.execute update_student_points

        await adjustStudentPoints('student-1', 25)

        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'points_adjusted',
                body: expect.stringContaining('+25'),
            })
        )
    })

    it('sends N18 with negative sign for negative adjustment', async () => {
        mockDrizzleDb.enqueue([{ role: 'admin' }]) // verifyAdmin
        mockDrizzleDb.enqueueEmpty() // db.execute update_student_points

        await adjustStudentPoints('student-1', -12)

        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ body: expect.stringContaining('-12') })
        )
    })
})

// ─── Flow I: Booking cancellation ─────────────────────────────────────────────

describe('Flow I: Student cancels own booking', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('cancels booking and notifies other confirmed players', async () => {
        // getCurrentUser → { id: 'student-1' } (global mock) — booking.user_id must match
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()

        mockDrizzleDb.enqueue([
            {
                user_id: 'student-1',
                status: 'confirmed',
                equipment_ids: [],
                start_time: farStart,
                players_list: [{ id: 'player-2', status: 'confirmed' }],
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ]) // select booking+courts
        mockDrizzleDb.enqueueEmpty() // update bookings cancel

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
