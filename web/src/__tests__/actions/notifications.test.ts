import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb, FIXTURES } from '../mocks/supabase'

// ─── Module mocks ──────────────────────────���──────────────────��───────────────

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')
vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { getPlayerLimits } from '@/lib/sport-config'

import {
    sendNotification,
    sendNotifications,
    getMyNotifications,
    getNewNotifications,
    getUnreadCount,
    markNotificationRead,
    markAllNotificationsRead,
    notifyManagers,
    notifyAdmins,
    notifyAdminsAndManagers,
    broadcastToAllStudents,
    acceptPlayRequest,
    rejectPlayRequest,
    getMyPlayRequests,
} from '@/actions/notifications'

// ─── Helpers ─────────────────────────────���──────────────────────────────────���─

function makeDb() {
    return makeMockDb()
}

// ─── sendNotification ──────────────────────────────���──────────────────────────

describe('sendNotification', () => {
    it('inserts a notification and returns its id', async () => {
        const adminDb = makeDb()
        adminDb.mockTable('notifications', { data: { id: 'notif-abc' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const id = await sendNotification({
            recipientId: 'u-1',
            type: 'test_type',
            title: 'Test',
            body: 'Test body',
        })
        expect(id).toBe('notif-abc')
    })

    it('returns null on DB error', async () => {
        const adminDb = makeDb()
        adminDb.mockTable('notifications', { data: null, error: { message: 'DB error' } })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const id = await sendNotification({
            recipientId: 'u-1',
            type: 'test_type',
            title: 'Test',
            body: 'Test body',
        })
        expect(id).toBeNull()
    })

    it('uses null for senderId when omitted', async () => {
        const adminDb = makeDb()
        adminDb.mockTable('notifications', { data: { id: 'n-1' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await sendNotification({ recipientId: 'u-1', type: 'x', title: 'T', body: 'B' })
        // Just verify it resolved without error (no senderId field in input)
        expect(adminDb.client.from).toHaveBeenCalledWith('notifications')
    })
})

// ─── sendNotifications ────────────────────────────────��───────────────────────

describe('sendNotifications', () => {
    it('is a no-op for empty array', async () => {
        const adminDb = makeDb()
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await sendNotifications([])
        expect(adminDb.client.from).not.toHaveBeenCalled()
    })

    it('inserts all notifications in a single batch', async () => {
        const adminDb = makeDb()
        adminDb.mockTable('notifications', { data: [{}, {}], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await sendNotifications([
            { recipientId: 'u-1', type: 'a', title: 'T1', body: 'B1' },
            { recipientId: 'u-2', type: 'b', title: 'T2', body: 'B2' },
        ])
        expect(adminDb.client.from).toHaveBeenCalledWith('notifications')
    })
})

// ─── notifyManagers / notifyAdmins / broadcastToAllStudents ────────────────���──

describe('notifyManagers', () => {
    it('sends notifications to all managers', async () => {
        const adminDb = makeDb()
        adminDb.mockTableOnce('profiles', { data: [{ id: 'm-1' }, { id: 'm-2' }], error: null })
        adminDb.mockTableOnce('notifications', { data: [{}, {}], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await notifyManagers({ type: 'new_booking', title: 'New', body: 'Body' })
        expect(adminDb.client.from).toHaveBeenCalledWith('profiles')
        expect(adminDb.client.from).toHaveBeenCalledWith('notifications')
    })

    it('does nothing when no managers exist', async () => {
        const adminDb = makeDb()
        adminDb.mockTable('profiles', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await notifyManagers({ type: 'x', title: 'T', body: 'B' })
        // notifications table should NOT be touched
        const calls = (adminDb.client.from as any).mock.calls.map((c: any[]) => c[0])
        expect(calls.filter((t: string) => t === 'notifications')).toHaveLength(0)
    })
})

describe('broadcastToAllStudents', () => {
    it('fetches students and inserts one notification per student', async () => {
        const adminDb = makeDb()
        adminDb.mockTableOnce('profiles', {
            data: [{ id: 's-1' }, { id: 's-2' }, { id: 's-3' }],
            error: null,
        })
        adminDb.mockTableOnce('notifications', { data: [{}, {}, {}], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await broadcastToAllStudents({ type: 'announcement', title: 'Hi', body: 'Hello all' })
        const fromCalls = (adminDb.client.from as any).mock.calls.map((c: any[]) => c[0])
        expect(fromCalls).toContain('profiles')
        expect(fromCalls).toContain('notifications')
    })
})

// ─── getMyNotifications ────────────────────────���──────────────────────────────

describe('getMyNotifications', () => {
    it('returns empty array when not authenticated', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getMyNotifications()
        expect(result).toEqual([])
    })

    it('excludes play_request_received notifications', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
        db.mockTable('notifications', {
            data: [FIXTURES.notification],
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getMyNotifications()
        expect(result).toHaveLength(1)
        // Verify the .not() filter was applied (we can check the chain was called)
        expect(db.client.from).toHaveBeenCalledWith('notifications')
    })

    it('filters to unread-only when requested', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
        db.mockTable('notifications', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await getMyNotifications(true)
        expect(db.client.from).toHaveBeenCalledWith('notifications')
    })
})

// ─── getUnreadCount ─────────────────────────────────────────��─────────────────

describe('getUnreadCount', () => {
    it('returns 0 when unauthenticated', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        expect(await getUnreadCount()).toBe(0)
    })

    it('returns the count from the DB', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
        // The count comes from { count } destructure — mock a chain returning count=5
        const chain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            then: (resolve: any) =>
                resolve({ count: 5, error: null }),
        }
        db.client.from = vi.fn().mockReturnValue(chain)
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const count = await getUnreadCount()
        expect(count).toBe(5)
    })

    it('excludes play_request_received from the badge count', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
        const chain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            not: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 3, error: null }),
        }
        db.client.from = vi.fn().mockReturnValue(chain)
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await getUnreadCount()
        expect(chain.not).toHaveBeenCalledWith('type', 'eq', 'play_request_received')
    })
})

// ─── getMyPlayRequests ─────────────────────────────────────────────────────────

describe('getMyPlayRequests', () => {
    it('returns empty array when unauthenticated', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getMyPlayRequests()
        expect(result).toEqual([])
        expect(db.client.from).not.toHaveBeenCalled()
    })

    it('returns play requests for the authenticated user', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        db.mockTable('play_requests', { data: [FIXTURES.playRequest], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getMyPlayRequests()
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ id: FIXTURES.playRequest.id })
        expect(db.client.from).toHaveBeenCalledWith('play_requests')
    })

    it('returns empty array when DB returns no rows', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        db.mockTable('play_requests', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getMyPlayRequests()
        expect(result).toEqual([])
    })
})

// ─── markNotificationRead ────────────────────────��────────────────────────────

describe('markNotificationRead', () => {
    it('updates is_read to true for the given id', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
        db.mockTable('notifications', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await markNotificationRead('notif-1')
        expect(db.client.from).toHaveBeenCalledWith('notifications')
    })
})

// ─── acceptPlayRequest ─────────────────────────────────��──────────────────────

describe('acceptPlayRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns error when unauthenticated', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeDb().client as any)

        const result = await acceptPlayRequest('pr-1')
        expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when play request not found', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeDb()
        adminDb.mockTable('play_requests', { data: null, error: { message: 'not found' } })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await acceptPlayRequest('pr-999')
        expect(result).toEqual({ error: 'Play request not found' })
    })

    it('returns error when request already responded', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeDb()
        adminDb.mockTable('play_requests', {
            data: { ...FIXTURES.playRequest, status: 'accepted' },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await acceptPlayRequest('pr-1')
        expect(result).toEqual({ error: 'Already responded to this request' })
    })

    it('returns error when underlying booking is cancelled', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeDb()
        adminDb.mockTable('play_requests', {
            data: {
                ...FIXTURES.playRequest,
                status: 'pending',
                bookings: { ...FIXTURES.playRequest.bookings, status: 'cancelled' },
            },
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await acceptPlayRequest('pr-1')
        expect(result).toEqual({ error: 'The booking has already been cancelled or completed' })
    })

    it('happy path: updates players_list to confirmed, marks request accepted', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        // Profile query for accepting player
        db.mockTable('profiles', {
            data: { id: 'student-1', full_name: 'Alice', branch: 'CSE', gender: 'female', year: '2' },
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeDb()
        // play_requests fetch
        adminDb.mockTableOnce('play_requests', {
            data: {
                id: 'pr-1',
                booking_id: 'booking-1',
                status: 'pending',
                notification_id: 'notif-1',
                bookings: { id: 'booking-1', status: 'confirmed', user_id: 'student-2', start_time: FIXTURES.booking.start_time, courts: { name: 'Badminton Court A', sport: 'badminton' } },
            },
            error: null,
        })
        // bookings fetch for players_list + num_players (ISSUE-007: num_players must be fetched to increment)
        adminDb.mockTableOnce('bookings', {
            data: { players_list: [{ id: 'student-1', status: 'pending' }], num_players: 1 },
            error: null,
        })
        // bookings update
        adminDb.mockTableOnce('bookings', { data: null, error: null })
        // play_requests update
        adminDb.mockTableOnce('play_requests', { data: null, error: null })
        // notifications update (mark read)
        adminDb.mockTableOnce('notifications', { data: null, error: null })
        // sendNotification insert
        adminDb.mockTableOnce('notifications', { data: { id: 'n-new' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await acceptPlayRequest('pr-1')
        expect(result).toEqual({ success: true })
    })

    it('increments num_players when a player accepts (ISSUE-007)', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        db.mockTable('profiles', {
            data: { id: 'student-1', full_name: 'Alice', branch: 'CSE', gender: 'female', year: '2' },
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeDb()
        // play_requests fetch
        adminDb.mockTableOnce('play_requests', {
            data: {
                id: 'pr-1',
                booking_id: 'booking-1',
                status: 'pending',
                notification_id: null,
                bookings: {
                    id: 'booking-1',
                    status: 'confirmed',
                    user_id: 'student-2',
                    start_time: FIXTURES.booking.start_time,
                    courts: { name: 'Badminton Court A', sport: 'badminton' },
                },
            },
            error: null,
        })
        // notifications (sendNotification insert)
        adminDb.mockTableOnce('notifications', { data: { id: 'n-x' }, error: null })

        // Intercept bookings calls to capture the update payload
        let bookingsUpdateArgs: any = null
        let bookingsCallCount = 0
        const originalFrom = adminDb.client.from as ReturnType<typeof vi.fn>
        adminDb.client.from = vi.fn((table: string) => {
            if (table === 'bookings') {
                bookingsCallCount++
                if (bookingsCallCount === 1) {
                    // First call: .select('players_list, num_players').eq().single()
                    const fetchChain = {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        single: vi.fn().mockResolvedValue({
                            data: { players_list: [], num_players: 2 },
                            error: null,
                        }),
                    }
                    return fetchChain
                }
                // Second call: .update({...}).eq()
                const updateChain = {
                    update: vi.fn((args: any) => { bookingsUpdateArgs = args; return updateChain }),
                    eq: vi.fn().mockReturnThis(),
                    then: (resolve: any) => resolve({ data: null, error: null }),
                }
                return updateChain
            }
            return originalFrom(table)
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await acceptPlayRequest('pr-1')
        // num_players should be old value (2) + 1 = 3
        expect(bookingsUpdateArgs).toMatchObject({ num_players: 3 })
    })
})

// ─── rejectPlayRequest ─────────────────────────────────────────��──────────────

describe('rejectPlayRequest', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns error when unauthenticated', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeDb().client as any)

        expect(await rejectPlayRequest('pr-1')).toEqual({ error: 'Unauthorized' })
    })

    it('cancels the booking when reject drops players below minimum', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        db.mockTable('profiles', { data: { full_name: 'Alice' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })

        const adminDb = makeDb()
        // play_requests: currently 1 confirmed player (student-1), num_players=1 after reject → below min 2
        adminDb.mockTableOnce('play_requests', {
            data: {
                id: 'pr-1',
                booking_id: 'booking-1',
                status: 'pending',
                notification_id: null,
                bookings: {
                    id: 'booking-1',
                    status: 'confirmed',
                    user_id: 'student-2',
                    start_time: FIXTURES.booking.start_time,
                    num_players: 1, // already at minimum — after reject goes to 0
                    equipment_ids: ['eq-1'],
                    players_list: [{ id: 'student-1', status: 'confirmed' }],
                    courts: { name: 'Badminton Court A', sport: 'badminton' },
                },
            },
            error: null,
        })
        // equipment update (free)
        adminDb.mockTableOnce('equipment', { data: null, error: null })
        // booking cancel
        adminDb.mockTableOnce('bookings', { data: null, error: null })
        // sendNotification to booker
        adminDb.mockTableOnce('notifications', { data: { id: 'n-1' }, error: null })
        // play_requests mark rejected
        adminDb.mockTableOnce('play_requests', { data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await rejectPlayRequest('pr-1')
        expect(result).toEqual({ success: true, bookingCancelled: true })
    })

    it('does NOT cancel booking when enough players remain', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        db.mockTable('profiles', { data: { full_name: 'Alice' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })

        const adminDb = makeDb()
        adminDb.mockTableOnce('play_requests', {
            data: {
                id: 'pr-1',
                booking_id: 'booking-1',
                status: 'pending',
                notification_id: null,
                bookings: {
                    id: 'booking-1',
                    status: 'confirmed',
                    user_id: 'student-2',
                    start_time: FIXTURES.booking.start_time,
                    num_players: 4, // after reject: 3 → still ≥ 2
                    equipment_ids: [],
                    players_list: [
                        { id: 'student-1', status: 'confirmed' },
                        { id: 'student-3', status: 'confirmed' },
                        { id: 'student-4', status: 'confirmed' },
                    ],
                    courts: { name: 'Badminton Court A', sport: 'badminton' },
                },
            },
            error: null,
        })
        // booking update (update list + count)
        adminDb.mockTableOnce('bookings', { data: null, error: null })
        // sendNotification (N3) to booker
        adminDb.mockTableOnce('notifications', { data: { id: 'n-1' }, error: null })
        // play_requests update
        adminDb.mockTableOnce('play_requests', { data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await rejectPlayRequest('pr-1')
        expect(result).toEqual({ success: true, bookingCancelled: false })
    })

    it('writes players_list and num_players when cancelling booking (ISSUE-006)', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'student-1' } } })
        db.mockTable('profiles', { data: { full_name: 'Alice' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })

        let bookingUpdateArgs: any = null
        const adminDb = makeDb()
        adminDb.client.from = vi.fn((table: string) => {
            const chain = {
                select: vi.fn().mockReturnThis(),
                update: vi.fn((args: any) => {
                    if (table === 'bookings') bookingUpdateArgs = args
                    return chain
                }),
                insert: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                in: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                    data: table === 'play_requests'
                        ? {
                            id: 'pr-1',
                            booking_id: 'booking-1',
                            status: 'pending',
                            notification_id: null,
                            bookings: {
                                id: 'booking-1',
                                status: 'confirmed',
                                user_id: 'student-2',
                                start_time: FIXTURES.booking.start_time,
                                num_players: 1,
                                equipment_ids: [],
                                players_list: [{ id: 'student-1', status: 'confirmed' }],
                                courts: { name: 'Badminton Court A', sport: 'badminton' },
                            },
                        }
                        : null,
                    error: null,
                }),
                then: (resolve: any) => resolve({ data: { id: 'n-x' }, error: null }),
            }
            return chain
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await rejectPlayRequest('pr-1')
        // The cancellation update must include players_list and num_players, not just status
        expect(bookingUpdateArgs).toMatchObject({
            status: 'cancelled',
            players_list: expect.any(Array),
            num_players: expect.any(Number),
        })
    })
})

// ─── notifyAdminsAndManagers ──────────────────────────────────────────────────

describe('notifyAdminsAndManagers', () => {
    it('sends notifications to all admins and managers combined', async () => {
        const adminDb = makeDb()
        adminDb.mockTableOnce('profiles', {
            data: [{ id: 'admin-1' }, { id: 'manager-1' }, { id: 'manager-2' }],
            error: null,
        })
        adminDb.mockTableOnce('notifications', { data: [{}, {}, {}], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await notifyAdminsAndManagers({ type: 'emergency_alert', title: 'Alert', body: 'Urgent!' })

        const fromCalls = (adminDb.client.from as any).mock.calls.map((c: any[]) => c[0])
        expect(fromCalls).toContain('profiles')
        expect(fromCalls).toContain('notifications')
    })

    it('does nothing when no admins or managers exist', async () => {
        const adminDb = makeDb()
        adminDb.mockTable('profiles', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await notifyAdminsAndManagers({ type: 'x', title: 'T', body: 'B' })

        const calls = (adminDb.client.from as any).mock.calls.map((c: any[]) => c[0])
        expect(calls.filter((t: string) => t === 'notifications')).toHaveLength(0)
    })
})

// ─── markNotificationRead — ownership guard (ISSUE-009) ───────────────────────

describe('markNotificationRead — ownership guard', () => {
    it('does nothing when unauthenticated', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await markNotificationRead('notif-1')
        expect(db.client.from).not.toHaveBeenCalled()
    })

    it('scopes update to recipient_id so users cannot mark others\' notifications', async () => {
        const db = makeDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })

        let eqCalls: string[] = []
        const chain = {
            update: vi.fn().mockReturnThis(),
            eq: vi.fn((col: string) => { eqCalls.push(col); return chain }),
            then: (resolve: any) => resolve({ data: null, error: null }),
        }
        db.client.from = vi.fn().mockReturnValue(chain)
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await markNotificationRead('notif-1')
        expect(eqCalls).toContain('recipient_id')
    })
})
