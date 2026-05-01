/**
 * Concurrency & Race Condition Tests
 *
 * These tests verify that the system:
 *  1. Uses atomic DB operations (db.execute) for points — no lost updates
 *  2. Handles simultaneous booking attempts — only one wins via idempotency guard
 *  3. Correctly sequences play-request responses when multiple happen at once
 *  4. Does not double-notify when actions race
 *
 * Because the real DB enforces constraints, we test at the application layer that:
 *  - Point updates always go through db.execute (not read-modify-write)
 *  - The endSession idempotency guard (.returning() → empty) short-circuits on second call
 *  - rejectPlayRequest correctly handles an already-expired booking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'

// Mock notification helpers but keep real acceptPlayRequest / rejectPlayRequest / broadcastToAllStudents
vi.mock('@/actions/notifications', async (importOriginal) => {
    const actual = (await importOriginal()) as Record<string, unknown>
    return {
        ...actual,
        sendNotification: vi.fn().mockResolvedValue('n-1'),
        sendNotifications: vi.fn().mockResolvedValue(undefined),
        notifyManagers: vi.fn().mockResolvedValue(undefined),
        notifyAdmins: vi.fn().mockResolvedValue(undefined),
    }
})

vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

import { sendNotifications } from '@/actions/notifications'
import { endSession } from '@/actions/manager'
import {
    rejectPlayRequest,
    acceptPlayRequest,
    broadcastToAllStudents,
} from '@/actions/notifications'
import { createBooking } from '@/actions/bookings'

const START_TIME = new Date('2025-01-15T10:00:00Z')

// ─── 1. Atomic Points: endSession uses db.execute not read-modify-write ─────────

describe('endSession — points must use db.execute not manual read-modify-write', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('each call fires its own execute — no shared-state mutation', async () => {
        // First endSession (student-A, good equipment → delta=10)
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        mockDrizzleDb.enqueue([{ id: 'booking-A' }]) // returning()
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }]) // select equipment
        mockDrizzleDb.enqueueEmpty() // update equipment
        mockDrizzleDb.enqueue([{ user_id: 'student-A', players_list: [] }])
        mockDrizzleDb.enqueue([{ id: 'student-A' }])
        mockDrizzleDb.enqueueEmpty() // applyPoints execute
        mockDrizzleDb.enqueue([
            {
                id: 'booking-A',
                start_time: START_TIME,
                user_id: 'student-A',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ])

        const r1 = await endSession('booking-A', [{ id: 'eq-1', condition: 'good' }])
        expect(r1).toEqual({ success: true })
        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(1)

        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)

        // Second endSession (student-B, good equipment → delta=10)
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        mockDrizzleDb.enqueue([{ id: 'booking-B' }]) // returning()
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([{ user_id: 'student-B', players_list: [] }])
        mockDrizzleDb.enqueue([{ id: 'student-B' }])
        mockDrizzleDb.enqueueEmpty() // applyPoints execute
        mockDrizzleDb.enqueue([
            {
                id: 'booking-B',
                start_time: START_TIME,
                user_id: 'student-B',
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ])

        const r2 = await endSession('booking-B', [{ id: 'eq-2', condition: 'good' }])
        expect(r2).toEqual({ success: true })
        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(1)
    })

    it('second endSession for same booking returns already_handled — points not double-awarded', async () => {
        // First call succeeds
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        mockDrizzleDb.enqueue([{ id: 'b-1' }]) // returning() → non-empty → guard passes
        mockDrizzleDb.enqueue([{ total_usage_count: 0 }])
        mockDrizzleDb.enqueueEmpty()
        mockDrizzleDb.enqueue([{ user_id: 's1', players_list: [] }])
        mockDrizzleDb.enqueue([{ id: 's1' }])
        mockDrizzleDb.enqueueEmpty() // applyPoints execute
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                start_time: START_TIME,
                user_id: 's1',
                courts: { name: 'Ct', sport: 'b' },
            },
        ])

        const r1 = await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])
        expect(r1).toEqual({ success: true })
        expect(mockDrizzleDb.execute).toHaveBeenCalledTimes(1)

        mockDrizzleDb.reset()

        // Second call — returning() empty → markedRows.length === 0 → already_handled
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        mockDrizzleDb.enqueue([]) // returning() empty

        const r2 = await endSession('b-1', [{ id: 'eq-1', condition: 'good' }])
        expect(r2).toEqual({ already_handled: true })
        expect(mockDrizzleDb.execute).not.toHaveBeenCalled()
    })
})

// ─── 2. Simultaneous createBooking for the same slot ─────────────────────────

describe('createBooking — slot conflict detection', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockResolvedValue(undefined)
    })

    it('second booking for same slot detects conflict and returns error', async () => {
        const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        const makeFormData = () => {
            const fd = new FormData()
            fd.set('courtId', 'court-1')
            fd.set('startTime', futureStart)
            fd.set('duration', '60')
            fd.set('numPlayers', '2')
            fd.set('playersList', '[]')
            fd.set('equipmentIds', '[]')
            return fd
        }

        // First booking: no conflict
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }]) // profile
        mockDrizzleDb.enqueue([{ count: 0 }]) // violations count
        mockDrizzleDb.enqueue([]) // court overlap (empty)
        mockDrizzleDb.enqueue([]) // student overlap (empty)
        mockDrizzleDb.enqueue([{ sport: 'badminton', name: 'Court A' }]) // courts
        mockDrizzleDb.enqueue([{ id: 'booking-new' }]) // insert.returning()

        const resultA = await createBooking(null, makeFormData())
        expect(resultA.error).toBeUndefined()

        mockDrizzleDb.reset()

        // Second booking: conflict found
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }])
        mockDrizzleDb.enqueue([{ count: 0 }])
        mockDrizzleDb.enqueue([{ id: 'booking-new' }]) // court overlap returns existing

        const resultB = await createBooking(null, makeFormData())
        expect(resultB.error).toBe('Time slot is already booked')
    })
})

// ─── 3. Race condition: play request responses ─────────────────────────────────

describe('Play request race conditions', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('acceptPlayRequest returns error if request was already responded to', async () => {
        mockDrizzleDb.enqueue([
            { id: 'pr-1', status: 'expired', booking_id: 'b-1', recipient_id: 'student-1' },
        ])

        const result = await acceptPlayRequest('pr-1')
        expect(result).toEqual({ error: 'Already responded to this request' })
    })

    it('rejectPlayRequest returns error if request was already accepted by someone else', async () => {
        mockDrizzleDb.enqueue([
            { id: 'pr-1', status: 'accepted', booking_id: 'b-1', recipient_id: 'student-1' },
        ])

        const result = await rejectPlayRequest('pr-1')
        expect(result).toEqual({ error: 'Already responded to this request' })
    })

    it('double-rejection: second call sees already-rejected status and returns error', async () => {
        // First reject: pending → booking cancelled (drops below min players)
        mockDrizzleDb.enqueue([
            { id: 'pr-race', status: 'pending', booking_id: 'b-1', notification_id: 'notif-race' },
        ])
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                status: 'confirmed',
                user_id: 'student-booker',
                start_time: START_TIME,
                num_players: 2,
                equipment_ids: [],
                players_list: [{ id: 'student-1', status: 'pending' }],
                court_name: 'Ct A',
                court_sport: 'badminton',
            },
        ])
        mockDrizzleDb.enqueue([{ full_name: 'Bob' }]) // profile of rejecter
        mockDrizzleDb.enqueueEmpty() // update bookings cancel
        mockDrizzleDb.enqueue([{ id: 'n-cancel' }]) // internal sendNotification.returning()
        mockDrizzleDb.enqueueEmpty() // update playRequests rejected
        mockDrizzleDb.enqueueEmpty() // update notifications (mark read)

        const firstResult = await rejectPlayRequest('pr-race')
        expect((firstResult as any).success).toBe(true)

        mockDrizzleDb.reset()

        // Second reject: sees status already 'rejected'
        mockDrizzleDb.enqueue([
            { id: 'pr-race', status: 'rejected', booking_id: 'b-1', recipient_id: 'student-1' },
        ])

        const secondResult = await rejectPlayRequest('pr-race')
        expect(secondResult).toEqual({ error: 'Already responded to this request' })
    })

    it('acceptPlayRequest handles booking already cancelled (expiry race)', async () => {
        mockDrizzleDb.enqueue([
            { id: 'pr-1', status: 'pending', booking_id: 'b-1', notification_id: null },
        ])
        mockDrizzleDb.enqueue([
            { id: 'b-1', status: 'cancelled', user_id: 'student-2', start_time: START_TIME },
        ])
        mockDrizzleDb.enqueueEmpty() // update playRequests expired

        const result = await acceptPlayRequest('pr-1')
        expect(result).toEqual({ error: 'The booking has already been cancelled or completed' })
    })

    it('parallel accept + reject: second call gets "already responded" error', async () => {
        // First: accept (status=pending → accepted)
        mockDrizzleDb.enqueue([
            { id: 'pr-race', status: 'pending', booking_id: 'b-1', notification_id: null },
        ])
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                status: 'confirmed',
                user_id: 'student-2',
                start_time: START_TIME,
                players_list: [],
                num_players: 1,
                court_name: 'Ct',
                court_sport: 'badminton',
            },
        ])
        mockDrizzleDb.enqueue([
            { id: 'student-1', full_name: 'Alice', branch: 'CSE', gender: 'female', year: '2' },
        ]) // profile
        mockDrizzleDb.enqueueEmpty() // update bookings
        mockDrizzleDb.enqueueEmpty() // update playRequests accepted
        // notification_id is null → no update notifications
        mockDrizzleDb.enqueue([{ id: 'n-accept' }]) // internal sendNotification.returning()

        const acceptResult = await acceptPlayRequest('pr-race')
        expect(acceptResult).toEqual({ success: true })

        mockDrizzleDb.reset()

        // Second: reject sees pr as already accepted
        mockDrizzleDb.enqueue([{ id: 'pr-race', status: 'accepted', booking_id: 'b-1' }])

        const rejectResult = await rejectPlayRequest('pr-race')
        expect(rejectResult).toEqual({ error: 'Already responded to this request' })
    })
})

// ─── 4. Equipment double-reservation race ─────────────────────────────────────

describe('createBooking — equipment reservation collision', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('second booking for same equipment returns error when lock returns 0 rows', async () => {
        const futureStart = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
        const makeFormData = (equipmentIds: string[]) => {
            const fd = new FormData()
            fd.set('courtId', 'court-1')
            fd.set('startTime', futureStart)
            fd.set('duration', '60')
            fd.set('numPlayers', '2')
            fd.set('playersList', '[]')
            fd.set('equipmentIds', JSON.stringify(equipmentIds))
            return fd
        }

        // Request A: equipment lock succeeds → booking created
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }])
        mockDrizzleDb.enqueue([{ count: 0 }])
        mockDrizzleDb.enqueue([]) // court overlap
        mockDrizzleDb.enqueue([]) // student overlap
        mockDrizzleDb.enqueue([{ sport: 'badminton', name: 'Court A' }])
        mockDrizzleDb.enqueue([{ id: 'eq-1' }]) // equipment lock returning() → 1 row = success
        mockDrizzleDb.enqueue([{ id: 'new-booking' }]) // insert.returning()

        const resultA = await createBooking(null, makeFormData(['eq-1']))
        expect(resultA.error).toBeUndefined()

        mockDrizzleDb.reset()

        // Request B: equipment lock returns 0 rows → already taken
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }])
        mockDrizzleDb.enqueue([{ count: 0 }])
        mockDrizzleDb.enqueue([]) // court overlap
        mockDrizzleDb.enqueue([]) // student overlap
        mockDrizzleDb.enqueue([{ sport: 'badminton', name: 'Court A' }])
        mockDrizzleDb.enqueue([]) // equipment lock returning() → 0 rows = fail

        const resultB = await createBooking(null, makeFormData(['eq-1']))
        expect(resultB.error).toMatch(/no longer available/i)
    })
})

// ─── 5. broadcastToAllStudents sends one batch ───────────────────────────────

describe('Broadcast notification ordering', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('sendNotifications is called in one batch even for large student lists', async () => {
        const manyStudents = Array.from({ length: 500 }, (_, i) => ({ id: `s-${i}` }))
        mockDrizzleDb.enqueue(manyStudents) // select profiles (students)
        mockDrizzleDb.enqueueEmpty() // insert notifications (internal sendNotifications)

        await broadcastToAllStudents({ type: 'announcement', title: 'T', body: 'B' })

        // insert called exactly once (batch, not 500 individual calls)
        expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(1)
    })
})
