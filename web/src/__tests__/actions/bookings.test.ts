import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb, FIXTURES } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')
vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendNotification, sendNotifications, notifyManagers, notifyAdminsAndManagers } from '@/actions/notifications'
import { getPlayerLimits } from '@/lib/sport-config'

import {
    createBooking,
    cancelBooking,
    withdrawFromBooking,
    searchStudents,
    getBookingsForDateRange,
    getAvailableEquipment,
    studentEmergencyAlert,
    getStudentBookings,
} from '@/actions/bookings'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function futureTime(hoursFromNow = 2) {
    return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString()
}

function makeFormData(overrides: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('courtId', 'court-1')
    fd.set('startTime', futureTime(2))
    fd.set('duration', '60')
    fd.set('numPlayers', '2')
    fd.set('playersList', '[]')
    fd.set('equipmentIds', '[]')
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
    return fd
}

function setupAuthenticatedDb(overrides: Partial<typeof FIXTURES.profile> = {}) {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: FIXTURES.user } })
    return db
}

// ─── getBookingsForDateRange ───────────────────────────────────────────────────

describe('getBookingsForDateRange', () => {
    it('returns bookings array on success', async () => {
        const db = makeMockDb()
        db.mockTable('bookings', { data: [FIXTURES.booking], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingsForDateRange('court-1', new Date(), new Date())
        expect(result).toHaveLength(1)
    })

    it('returns empty array on DB error', async () => {
        const db = makeMockDb()
        db.mockTable('bookings', { data: null, error: { message: 'fail' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingsForDateRange('court-1', new Date(), new Date())
        expect(result).toEqual([])
    })
})

// ─── getAvailableEquipment ────────────────────────────────────────────────────

describe('getAvailableEquipment', () => {
    it('returns empty array when no equipment found', async () => {
        const db = makeMockDb()
        db.mockTable('equipment', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        expect(await getAvailableEquipment('badminton')).toEqual([])
    })

    it('marks equipment as in_use when reserved in overlapping booking', async () => {
        const db = makeMockDb()
        db.mockTableOnce('equipment', {
            data: [
                { id: 'eq-1', name: 'Racket A', sport: 'badminton', condition: 'good', is_available: true },
                { id: 'eq-2', name: 'Racket B', sport: 'badminton', condition: 'good', is_available: true },
            ],
            error: null,
        })
        db.mockTableOnce('bookings', {
            data: [{ equipment_ids: ['eq-1'] }],
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getAvailableEquipment('badminton', futureTime(1), futureTime(2))
        const eq1 = result.find((e: any) => e.id === 'eq-1')
        const eq2 = result.find((e: any) => e.id === 'eq-2')
        expect(eq1?.in_use).toBe(true)
        expect(eq2?.in_use).toBe(false)
    })

    it('marks is_available=false equipment as in_use even without overlap', async () => {
        const db = makeMockDb()
        db.mockTableOnce('equipment', {
            data: [{ id: 'eq-3', name: 'Net', sport: 'badminton', condition: 'good', is_available: false }],
            error: null,
        })
        db.mockTableOnce('bookings', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getAvailableEquipment('badminton', futureTime(1), futureTime(2))
        expect(result[0].in_use).toBe(true)
    })
})

// ─── createBooking ────────────────────────────────────────────────────────────

describe('createBooking', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects when startTime is in the past', async () => {
        const db = setupAuthenticatedDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = makeFormData({ startTime: new Date(Date.now() - 60_000).toISOString() })
        const result = await createBooking(null, fd)
        expect(result.error).toBe('Cannot book a slot in the past')
    })

    it('rejects when user is not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createBooking(null, makeFormData())
        expect(result.error).toBe('Unauthorized')
    })

    it('rejects when student has an active 14-day time ban', async () => {
        const db = setupAuthenticatedDb()
        const bannedUntil = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        db.mockTable('profiles', { data: { banned_until: bannedUntil }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createBooking(null, makeFormData())
        expect(result.error).toMatch(/temporarily banned/)
    })

    it('rejects when student has 3+ violations (suspended)', async () => {
        const db = setupAuthenticatedDb()
        db.mockTableOnce('profiles', { data: { banned_until: null }, error: null })

        // violation count query — simulate count=3
        const countChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 3, error: null }),
        }
        const originalFrom = db.client.from
        db.client.from = vi.fn((table: string) => {
            if (table === 'student_violations') return countChain
            return (originalFrom as any)(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createBooking(null, makeFormData())
        expect(result.error).toMatch(/suspended/)
    })

    it('rejects when the time slot is already booked', async () => {
        const db = setupAuthenticatedDb()
        db.mockTableOnce('profiles', { data: { banned_until: null }, error: null })

        const countChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 0, error: null }),
        }

        let tableCallCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table === 'student_violations') return countChain
            if (table === 'bookings') {
                tableCallCount++
                if (tableCallCount === 1) {
                    // First bookings call: court overlap check
                    const chain = {
                        select: vi.fn().mockReturnThis(),
                        eq: vi.fn().mockReturnThis(),
                        neq: vi.fn().mockReturnThis(),
                        or: vi.fn().mockReturnThis(),
                        then: (resolve: any) => resolve({ data: [{ id: 'existing-booking' }], error: null }),
                    }
                    return chain
                }
            }
            return makeMockDb().client.from(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createBooking(null, makeFormData())
        expect(result.error).toBe('Time slot is already booked')
    })

    it('rejects when player count is below sport minimum', async () => {
        const db = setupAuthenticatedDb()
        // No ban, no violations, no conflicts
        db.mockTableOnce('profiles', { data: { banned_until: null }, error: null })
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })

        // Build a controlled from() that short-circuits all the way to court check
        const emptyChain = (resolve: any) => resolve({ data: [], error: null })
        const violationsChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 0, error: null }),
        }
        const conflictChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [], error: null }),
        }
        const courtChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sport: 'badminton', name: 'Badminton Court A' }, error: null }),
        }
        db.client.from = vi.fn((table: string) => {
            if (table === 'student_violations') return violationsChain
            if (table === 'bookings') return conflictChain
            if (table === 'courts') return courtChain
            return makeMockDb().client.from(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = makeFormData({ numPlayers: '1' }) // below min=2
        const result = await createBooking(null, fd)
        expect(result.error).toMatch(/Minimum 2 players/)
    })

    it('rejects when player count exceeds sport maximum', async () => {
        const db = setupAuthenticatedDb()
        db.mockTableOnce('profiles', { data: { banned_until: null }, error: null })
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 4 })

        const violationsChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 0, error: null }),
        }
        const conflictChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [], error: null }),
        }
        const courtChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sport: 'table tennis', name: 'TT Court' }, error: null }),
        }
        db.client.from = vi.fn((table: string) => {
            if (table === 'student_violations') return violationsChain
            if (table === 'bookings') return conflictChain
            if (table === 'courts') return courtChain
            return makeMockDb().client.from(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = makeFormData({ numPlayers: '5' }) // exceeds max=4
        const result = await createBooking(null, fd)
        expect(result.error).toMatch(/Maximum 4 players/)
    })

    it('sends play request notifications to each invited player', async () => {
        const db = setupAuthenticatedDb()
        db.mockTableOnce('profiles', { data: { banned_until: null }, error: null })
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })

        const violationsChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 0, error: null }),
        }
        const emptyConflict = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [], error: null }),
        }
        let profileCallCount = 0
        const profileChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            single: vi.fn(async () => {
                profileCallCount++
                if (profileCallCount === 1) return { data: { banned_until: null }, error: null }
                return { data: { full_name: 'Alice', branch: 'CSE', gender: 'female', year: '2' }, error: null }
            }),
            then: (resolve: any) => resolve({ data: [{ id: 'student-2', full_name: 'Bob', branch: 'ECE', gender: 'male', year: '3' }], error: null }),
        }
        const courtChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sport: 'badminton', name: 'Court A' }, error: null }),
        }
        const equipmentChain = {
            update: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [{ id: 'eq-1' }], error: null }),
        }
        const insertChain = {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'booking-new' }, error: null }),
        }

        db.client.from = vi.fn((table: string) => {
            if (table === 'student_violations') return violationsChain
            if (table === 'bookings') return { ...emptyConflict, ...insertChain, select: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'booking-new' }, error: null }) }), eq: emptyConflict.eq, neq: emptyConflict.neq, or: emptyConflict.or }
            if (table === 'profiles') return profileChain
            if (table === 'courts') return courtChain
            if (table === 'equipment') return equipmentChain
            return makeMockDb().client.from(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTable('play_requests', { data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const players = [{ id: 'student-2', full_name: 'Bob' }]
        const fd = makeFormData({
            numPlayers: '2',
            playersList: JSON.stringify(players),
        })
        const result = await createBooking(null, fd)

        // sendNotification should be called once per invited player
        expect(vi.mocked(sendNotification)).toHaveBeenCalledTimes(1)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'student-2', type: 'play_request_received' }),
        )
    })

    it('re-frees equipment if booking insert fails', async () => {
        const db = setupAuthenticatedDb()
        db.mockTableOnce('profiles', { data: { banned_until: null }, error: null })
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })

        const violationsChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 0, error: null }),
        }
        const emptyConflict = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(), or: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [], error: null }),
        }
        const courtChain = {
            select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { sport: 'badminton', name: 'Court A' }, error: null }),
        }
        const equipmentUpdateChain = {
            update: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ data: [{ id: 'eq-1' }], error: null }),
        }
        let bookingsCallCount = 0
        const bookingsChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            neq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB insert failed' } }),
            }),
            then: (resolve: any) => {
                bookingsCallCount++
                return resolve({ data: [], error: null }) // no conflicts
            },
        }

        db.client.from = vi.fn((table: string) => {
            if (table === 'student_violations') return violationsChain
            if (table === 'bookings') return bookingsChain
            if (table === 'courts') return courtChain
            if (table === 'equipment') return equipmentUpdateChain
            return makeMockDb().client.from(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = makeFormData({ equipmentIds: JSON.stringify(['eq-1']) })
        const result = await createBooking(null, fd)
        expect(result.error).toBe('DB insert failed')
        // Equipment should be re-freed: update called at least twice (lock + free)
        expect(equipmentUpdateChain.update).toHaveBeenCalledTimes(2)
    })
})

// ─── cancelBooking ────────────────────────────────────────────────────────────

describe('cancelBooking', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns error when not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await cancelBooking('b-1')).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when booking not found', async () => {
        const db = setupAuthenticatedDb()
        db.mockTable('bookings', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await cancelBooking('b-1')).toEqual({ error: 'Booking not found' })
    })

    it('returns error when user does not own the booking', async () => {
        const db = setupAuthenticatedDb()
        db.mockTable('bookings', {
            data: { ...FIXTURES.booking, user_id: 'someone-else' },
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await cancelBooking('b-1')).toEqual({ error: 'Not your booking' })
    })

    it('returns error for non-cancellable status (active)', async () => {
        const db = setupAuthenticatedDb()
        db.mockTable('bookings', {
            data: { ...FIXTURES.booking, status: 'active' },
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await cancelBooking('b-1')).toEqual({ error: 'Cannot cancel this booking' })
    })

    it('applies -3 point penalty for late cancellation (within 3 hours)', async () => {
        const db = setupAuthenticatedDb()
        const soonStart = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString() // 1h from now
        db.mockTableOnce('bookings', {
            data: {
                ...FIXTURES.booking,
                start_time: soonStart,
                status: 'confirmed',
                equipment_ids: [],
                players_list: [],
                courts: { name: 'Ct A', sport: 'badminton' },
            },
            error: null,
        })
        db.mockTableOnce('bookings', { data: null, error: null }) // cancel update

        const updateMock = vi.fn().mockReturnThis()
        db.client.from = vi.fn((table: string) => {
            if (table === 'bookings') {
                let callCount = 0
                return {
                    select: vi.fn().mockReturnThis(),
                    eq: vi.fn().mockReturnThis(),
                    in: vi.fn().mockReturnThis(),
                    update: vi.fn().mockReturnThis(),
                    single: vi.fn(async () => {
                        callCount++
                        if (callCount === 1) {
                            return {
                                data: {
                                    ...FIXTURES.booking,
                                    user_id: FIXTURES.user.id,
                                    start_time: soonStart,
                                    status: 'confirmed',
                                    equipment_ids: [],
                                    players_list: [],
                                    courts: { name: 'Ct A', sport: 'badminton' },
                                },
                                error: null,
                            }
                        }
                        return { data: null, error: null }
                    }),
                    then: (resolve: any) => resolve({ data: null, error: null }),
                }
            }
            return makeMockDb().client.from(table)
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await cancelBooking('b-1')
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: FIXTURES.user.id,
            p_delta: -3,
        })
    })

    it('does NOT apply penalty for cancellation with plenty of notice (> 3 hours)', async () => {
        const db = setupAuthenticatedDb()
        const farFutureStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()

        db.client.from = vi.fn((table: string) => {
            return {
                select: vi.fn().mockReturnThis(),
                eq: vi.fn().mockReturnThis(),
                update: vi.fn().mockReturnThis(),
                in: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                    data: {
                        ...FIXTURES.booking,
                        user_id: FIXTURES.user.id,
                        start_time: farFutureStart,
                        status: 'confirmed',
                        equipment_ids: [],
                        players_list: [],
                        courts: { name: 'Ct A', sport: 'badminton' },
                    },
                    error: null,
                }),
                then: (resolve: any) => resolve({ data: null, error: null }),
            }
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await cancelBooking('b-1')
        expect(adminDb.rpc).not.toHaveBeenCalled()
    })

    it('notifies confirmed players (N8) when booking is cancelled', async () => {
        const db = setupAuthenticatedDb()
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()

        db.client.from = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    user_id: FIXTURES.user.id,
                    start_time: farStart,
                    status: 'confirmed',
                    equipment_ids: [],
                    players_list: [{ id: 'student-2', status: 'confirmed' }],
                    courts: { name: 'Ct A', sport: 'badminton' },
                },
                error: null,
            }),
            then: (resolve: any) => resolve({ data: null, error: null }),
        }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        await cancelBooking('b-1')
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ recipientId: 'student-2', type: 'booking_cancelled_by_booker' }),
            ]),
        )
    })

    it('does NOT send N8 to pending-status players — only confirmed players are notified', async () => {
        const db = setupAuthenticatedDb()
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()

        db.client.from = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    user_id: FIXTURES.user.id,
                    start_time: farStart,
                    status: 'confirmed',
                    equipment_ids: [],
                    players_list: [
                        { id: 'student-confirmed', status: 'confirmed' },
                        { id: 'student-pending', status: 'pending' },
                    ],
                    courts: { name: 'Ct A', sport: 'badminton' },
                },
                error: null,
            }),
            then: (resolve: any) => resolve({ data: null, error: null }),
        }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        await cancelBooking('b-1')

        const calls = vi.mocked(sendNotifications).mock.calls
        if (calls.length > 0) {
            const notified = calls[0][0] as any[]
            const recipientIds = notified.map((n: any) => n.recipientId)
            expect(recipientIds).toContain('student-confirmed')
            expect(recipientIds).not.toContain('student-pending')
        }
        // If sendNotifications was not called at all, pending-only logic passed trivially;
        // the confirmed player must have been included.
        if (calls.length === 0) {
            throw new Error('Expected sendNotifications to be called for confirmed player')
        }
    })
})

// ─── withdrawFromBooking ──────────────────────────────────────────────────────

describe('withdrawFromBooking', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns error when not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await withdrawFromBooking('b-1')).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when booking not found', async () => {
        const db = setupAuthenticatedDb()
        db.mockTable('bookings', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await withdrawFromBooking('b-1')).toEqual({ error: 'Booking not found' })
    })

    it('sends N9 notification to the booker on successful withdrawal', async () => {
        const db = setupAuthenticatedDb()
        db.client.from = vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
                data: {
                    user_id: 'student-booker',
                    status: 'confirmed',
                    num_players: 3,
                    players_list: [{ id: FIXTURES.user.id, status: 'confirmed' }],
                    equipment_ids: [],
                    start_time: futureTime(2),
                    courts: { sport: 'badminton', name: 'Ct A' },
                },
                error: null,
            }),
            then: (resolve: any) => resolve({ data: null, error: null }),
        }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        await withdrawFromBooking('b-1')
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'student-booker', type: 'player_withdrew' }),
        )
    })
})

// ─── searchStudents ───────────────────────────────────────────────────────────

describe('searchStudents', () => {
    it('returns empty for short query (< 2 chars)', async () => {
        const db = makeMockDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        expect(await searchStudents('a')).toEqual([])
    })

    it('filters out banned students via or() filter', async () => {
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
            then: (resolve: any) => resolve({ data: [FIXTURES.profile], error: null }),
        }
        // Make or() return the chain so limit() can be called on it
        orSpy.mockReturnValue(queryChain)
        db.client.from = vi.fn(() => queryChain)
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await searchStudents('Alice')
        // The or() filter for banned_until should be applied
        expect(orSpy).toHaveBeenCalled()
        const orArg: string = orSpy.mock.calls[0][0]
        expect(orArg).toContain('banned_until')
    })
})

// ─── studentEmergencyAlert ────────────────────────────────────────────────────

describe('studentEmergencyAlert', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns error when not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await studentEmergencyAlert('b-1', 'Fire in the court')
        expect(result).toEqual({ error: 'Unauthorized' })
        expect(vi.mocked(notifyAdminsAndManagers)).not.toHaveBeenCalled()
    })

    it('returns error when DB insert fails', async () => {
        const db = setupAuthenticatedDb()
        db.client.from = vi.fn(() => ({
            insert: vi.fn().mockResolvedValue({ error: { message: 'insert failed' } }),
        }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await studentEmergencyAlert('b-1', 'Something went wrong')
        expect(result).toEqual({ error: 'insert failed' })
        expect(vi.mocked(notifyAdminsAndManagers)).not.toHaveBeenCalled()
    })

    it('inserts into feedback_complaints and fires notifyAdminsAndManagers on success', async () => {
        const db = setupAuthenticatedDb()
        const insertSpy = vi.fn().mockResolvedValue({ error: null })
        db.client.from = vi.fn(() => ({ insert: insertSpy }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await studentEmergencyAlert('b-1', 'Equipment is broken')
        expect(result).toEqual({ success: true })

        expect(insertSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                booking_id: 'b-1',
                category: 'emergency_by_student',
                status: 'open',
            }),
        )
        expect(vi.mocked(notifyAdminsAndManagers)).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'student_emergency_alert',
                data: expect.objectContaining({ booking_id: 'b-1' }),
            }),
        )
    })

    it('sends the student-supplied reason in the notification body', async () => {
        const db = setupAuthenticatedDb()
        db.client.from = vi.fn(() => ({
            insert: vi.fn().mockResolvedValue({ error: null }),
        }))
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await studentEmergencyAlert('b-2', 'Lights not working')
        expect(vi.mocked(notifyAdminsAndManagers)).toHaveBeenCalledWith(
            expect.objectContaining({ body: 'Lights not working' }),
        )
    })
})

// ─── getStudentBookings ───────────────────────────────────────────────────────

describe('getStudentBookings', () => {
    beforeEach(() => vi.clearAllMocks())

    /** Build a booking fixture with the given overrides */
    function makeBooking(overrides: Record<string, any> = {}) {
        const now = Date.now()
        return {
            id: 'b-default',
            user_id: 'u-1',
            start_time: new Date(now - 60 * 60 * 1000).toISOString(),  // 1 hr ago
            end_time: new Date(now + 60 * 60 * 1000).toISOString(),     // 1 hr from now
            status: 'active',
            num_players: 2,
            equipment_ids: [],
            players_list: [],
            courts: { name: 'Ct A', sport: 'badminton' },
            ...overrides,
        }
    }

    function setupTwoQueryDb(ownData: any[], playerData: any[] = []) {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
        let callCount = 0
        db.client.from = vi.fn((table: string) => {
            if (table !== 'bookings') return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (r: any) => r({ data: [], error: null }) }
            callCount++
            const isFirst = callCount === 1
            const data = isFirst ? ownData : playerData
            const chain: any = {}
            for (const m of ['select', 'eq', 'neq', 'contains', 'order']) {
                chain[m] = vi.fn().mockReturnValue(chain)
            }
            chain.then = (resolve: any) => resolve({ data, error: null })
            return chain
        })
        return db
    }

    it('active booking within its time window goes to current', async () => {
        const now = Date.now()
        const booking = makeBooking({
            id: 'b-active',
            status: 'active',
            start_time: new Date(now - 30 * 60 * 1000).toISOString(),
            end_time: new Date(now + 30 * 60 * 1000).toISOString(),
        })
        const db = setupTwoQueryDb([booking])
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { current, upcoming, past } = await getStudentBookings('u-1')
        expect(current.map((b: any) => b.id)).toContain('b-active')
        expect(upcoming.map((b: any) => b.id)).not.toContain('b-active')
        expect(past.map((b: any) => b.id)).not.toContain('b-active')
    })

    it('waiting_manager booking appears in upcoming (M-012 regression)', async () => {
        const now = Date.now()
        const booking = makeBooking({
            id: 'b-waiting',
            status: 'waiting_manager',
            start_time: new Date(now + 30 * 60 * 1000).toISOString(),
            end_time: new Date(now + 90 * 60 * 1000).toISOString(),
        })
        const db = setupTwoQueryDb([booking])
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { upcoming } = await getStudentBookings('u-1')
        expect(upcoming.map((b: any) => b.id)).toContain('b-waiting')
    })

    it('confirmed future booking goes to upcoming', async () => {
        const now = Date.now()
        const booking = makeBooking({
            id: 'b-confirmed',
            status: 'confirmed',
            start_time: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(now + 3 * 60 * 60 * 1000).toISOString(),
        })
        const db = setupTwoQueryDb([booking])
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { upcoming } = await getStudentBookings('u-1')
        expect(upcoming.map((b: any) => b.id)).toContain('b-confirmed')
    })

    it('completed booking goes to past', async () => {
        const now = Date.now()
        const booking = makeBooking({
            id: 'b-completed',
            status: 'completed',
            start_time: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        })
        const db = setupTwoQueryDb([booking])
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { past } = await getStudentBookings('u-1')
        expect(past.map((b: any) => b.id)).toContain('b-completed')
    })

    it('cancelled and rejected bookings go to past', async () => {
        const now = Date.now()
        const cancelled = makeBooking({ id: 'b-cancelled', status: 'cancelled',
            start_time: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(now - 1 * 60 * 60 * 1000).toISOString() })
        const rejected = makeBooking({ id: 'b-rejected', status: 'rejected',
            start_time: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(now - 3 * 60 * 60 * 1000).toISOString() })
        const db = setupTwoQueryDb([cancelled, rejected])
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { past } = await getStudentBookings('u-1')
        const pastIds = past.map((b: any) => b.id)
        expect(pastIds).toContain('b-cancelled')
        expect(pastIds).toContain('b-rejected')
    })

    it('deduplicates bookings that appear in both own and player queries', async () => {
        const now = Date.now()
        const booking = makeBooking({
            id: 'b-dup',
            status: 'confirmed',
            start_time: new Date(now + 60 * 60 * 1000).toISOString(),
            end_time: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        })
        // Return the same booking in BOTH own and player queries
        const db = setupTwoQueryDb([booking], [booking])
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const { upcoming } = await getStudentBookings('u-1')
        expect(upcoming.filter((b: any) => b.id === 'b-dup')).toHaveLength(1)
    })
})
