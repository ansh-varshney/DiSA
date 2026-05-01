/**
 * Tests for booking withdrawal edge cases and partial equipment lock rollback:
 *   - withdrawFromBooking: status not pending/confirmed (line 459)
 *   - withdrawFromBooking: drop below min with equipment (line 475)
 *   - withdrawFromBooking: drop below min with confirmed remaining players (lines 493-496)
 *   - createBooking: partial equipment lock rollback (lines 250-254)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { getCurrentUser } from '@/lib/session'

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('n-1'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
    acceptPlayRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectPlayRequest: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

import { withdrawFromBooking, createBooking } from '@/actions/bookings'
import { sendNotifications } from '@/actions/notifications'

// ─── withdrawFromBooking — invalid status ─────────────────────────────────────

describe('withdrawFromBooking — status validation', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when booking is not found', async () => {
        mockDrizzleDb.enqueue([]) // no booking

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual({ error: 'Booking not found' })
    })

    it('returns error when user is the booker (should use cancel instead)', async () => {
        mockDrizzleDb.enqueue([
            {
                user_id: 'student-1', // same as getCurrentUser mock
                status: 'confirmed',
                players_list: [],
                num_players: 2,
                equipment_ids: [],
                start_time: new Date(),
                courts: { sport: 'badminton', name: 'Badminton A' },
            },
        ])

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual({ error: 'You are the booker. Use cancel instead.' })
    })

    it('returns error when booking status is active (not withdrawable)', async () => {
        mockDrizzleDb.enqueue([
            {
                user_id: 'another-user',
                status: 'active', // not pending/confirmed
                players_list: [],
                num_players: 2,
                equipment_ids: [],
                start_time: new Date(),
                courts: { sport: 'badminton', name: 'Badminton A' },
            },
        ])

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual({ error: 'Cannot withdraw from this booking' })
    })

    it('returns error when booking status is completed', async () => {
        mockDrizzleDb.enqueue([
            {
                user_id: 'another-user',
                status: 'completed',
                players_list: [],
                num_players: 2,
                equipment_ids: [],
                start_time: new Date(),
                courts: { sport: 'badminton', name: 'Badminton A' },
            },
        ])

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual({ error: 'Cannot withdraw from this booking' })
    })
})

// ─── withdrawFromBooking — drops below minimum player count ───────────────────

describe('withdrawFromBooking — below minimum player count', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(sendNotifications).mockClear()
    })

    it('cancels booking and frees equipment when count drops below min', async () => {
        // The booking has 2 players (min=2). After withdrawal → 1 player < min → cancel
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                status: 'confirmed',
                players_list: [{ id: 'student-1', status: 'confirmed' }], // student-1 is withdrawing
                num_players: 2,
                equipment_ids: ['eq-1'],
                start_time: new Date(Date.now() + 3_600_000),
                courts: { sport: 'badminton', name: 'Badminton A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // free equipment (update is_available=true)
        mockDrizzleDb.enqueueEmpty() // cancel booking (update status=cancelled)

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual(expect.objectContaining({ success: true }))
        // Booking should be cancelled
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(2) // equipment + booking
    })

    it('sends cancellation notifications to booker and remaining confirmed players', async () => {
        // 3 players total, but withdrawal → 2 players (still meets min=2) — this tests the other path
        // For BELOW-MIN: 2 players, student-1 withdraws → 1 player → cancel
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                status: 'confirmed',
                // updatedPlayersList after removal is [] (empty), but booker still needs notif
                players_list: [
                    { id: 'student-1', status: 'confirmed' }, // withdrawing
                    { id: 'player-2', status: 'confirmed' }, // remaining — should get cancel notif
                ],
                num_players: 2,
                equipment_ids: [],
                start_time: new Date(Date.now() + 3_600_000),
                courts: { sport: 'badminton', name: 'Badminton A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // cancel booking

        await withdrawFromBooking('b-1')

        expect(vi.mocked(sendNotifications)).toHaveBeenCalled()
        const notifArg = vi.mocked(sendNotifications).mock.calls[0][0]
        const recipientIds = notifArg.map((n: any) => n.recipientId)
        // booker should be notified
        expect(recipientIds).toContain('booker-1')
        // remaining confirmed player should be notified
        expect(recipientIds).toContain('player-2')
        // the withdrawing student should NOT be notified
        expect(recipientIds).not.toContain('student-1')
    })

    it('does not notify players with non-confirmed status when cancelling', async () => {
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                status: 'confirmed',
                players_list: [
                    { id: 'student-1', status: 'confirmed' }, // withdrawing
                    { id: 'player-pending', status: 'pending_confirmation' }, // should NOT be notified
                ],
                num_players: 2,
                equipment_ids: [],
                start_time: new Date(Date.now() + 3_600_000),
                courts: { sport: 'tennis', name: 'Tennis A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty()

        await withdrawFromBooking('b-1')

        const notifArg = vi.mocked(sendNotifications).mock.calls[0]?.[0] ?? []
        const recipientIds = notifArg.map((n: any) => n.recipientId)
        expect(recipientIds).not.toContain('player-pending')
    })

    it('succeeds withdrawal without cancellation when player count stays above min', async () => {
        // 4 players, withdraw 1 → 3 players (still >= min of 2)
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                status: 'confirmed',
                players_list: [
                    { id: 'student-1', status: 'confirmed' }, // withdrawing
                    { id: 'player-2', status: 'confirmed' },
                    { id: 'player-3', status: 'confirmed' },
                ],
                num_players: 4,
                equipment_ids: [],
                start_time: new Date(Date.now() + 3_600_000),
                courts: { sport: 'badminton', name: 'Badminton A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // update players_list

        const result = await withdrawFromBooking('b-1')

        expect(result).toEqual({ success: true })
    })
})

// ─── createBooking — partial equipment lock rollback ──────────────────────────

describe('createBooking — partial equipment lock rollback', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('releases partially-locked equipment and returns error when not all can be locked', async () => {
        // Scenario: 2 equipment ids requested, only 1 locked successfully
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }]) // profile
        mockDrizzleDb.enqueue([{ count: 0 }]) // violations
        mockDrizzleDb.enqueue([]) // court conflict check → no conflict
        mockDrizzleDb.enqueue([]) // student conflict check → no conflict
        // playersList='[]' → no player profile fetch
        mockDrizzleDb.enqueue([]) // court data select (courtData=undefined → validation skipped)
        // Equipment lock → only 1 of 2 locked (partial lock)
        mockDrizzleDb.enqueue([{ id: 'eq-1' }]) // only eq-1 locked, eq-2 was unavailable

        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('startTime', new Date(Date.now() + 3_600_000).toISOString())
        fd.set('duration', '60')
        fd.set('numPlayers', '2')
        fd.set('playersList', '[]')
        fd.set('equipmentIds', JSON.stringify(['eq-1', 'eq-2']))

        const result = await createBooking(null, fd)

        expect(result.error).toMatch(/no longer available/)
        // lock attempt (update) + rollback (update) = 2 calls
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(2)
    })

    it('does NOT roll back when zero equipment were locked (nothing to release)', async () => {
        // All 2 equipment are unavailable — locked returns []
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }])
        mockDrizzleDb.enqueue([{ count: 0 }])
        mockDrizzleDb.enqueue([]) // court conflict check → no conflict
        mockDrizzleDb.enqueue([]) // student conflict check → no conflict
        // playersList='[]' → no player profile fetch
        mockDrizzleDb.enqueue([]) // court data select → courtData undefined
        mockDrizzleDb.enqueue([]) // equipment lock → nothing locked (all unavailable)

        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('startTime', new Date(Date.now() + 3_600_000).toISOString())
        fd.set('duration', '60')
        fd.set('numPlayers', '2')
        fd.set('playersList', '[]')
        fd.set('equipmentIds', JSON.stringify(['eq-1', 'eq-2']))

        const result = await createBooking(null, fd)

        expect(result.error).toMatch(/no longer available/)
        // Only the lock attempt update was called — no rollback (locked.length === 0)
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(1)
    })
})
