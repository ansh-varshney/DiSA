import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { getCurrentUser } from '@/lib/session'

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/sport-config', () => ({
    getPlayerLimits: vi.fn(() => ({ min: 2, max: 6 })),
}))

import {
    sendNotification,
    sendNotifications,
    notifyManagers,
    notifyAdminsAndManagers,
} from '@/actions/notifications'
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

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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

const PROFILE_OK = { banned_until: null, priority_booking_remaining: 0 }
const VIOLATIONS_ZERO = [{ count: 0 }]
const NO_CONFLICTS: any[] = []
const COURT_BADMINTON = { sport: 'badminton', name: 'Court A' }

const BOOKING_ROW = {
    id: 'b-1',
    user_id: 'student-1',
    start_time: futureTime(2),
    end_time: futureTime(3),
    status: 'confirmed',
    equipment_ids: [] as string[],
    players_list: [] as any[],
    courts: { name: 'Ct A', sport: 'badminton' },
}

// Global reset before every test
beforeEach(() => {
    mockDrizzleDb.reset()
    // re-apply notification mocks (reset() calls vi.clearAllMocks which clears history only,
    // but mockReturnValue overrides from prior tests may persist — be explicit)
    vi.mocked(sendNotification).mockResolvedValue('notif-new')
    vi.mocked(sendNotifications).mockResolvedValue(undefined)
    vi.mocked(notifyManagers).mockResolvedValue(undefined)
    vi.mocked(notifyAdminsAndManagers).mockResolvedValue(undefined)
    vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })
})

// ─── getBookingsForDateRange ───────────────────────────────────────────────────

describe('getBookingsForDateRange', () => {
    it('returns bookings array on success', async () => {
        mockDrizzleDb.enqueue([{ id: 'b-1', status: 'confirmed' }])
        const result = await getBookingsForDateRange('court-1', new Date(), new Date())
        expect(result).toHaveLength(1)
    })

    it('returns empty array when no bookings found', async () => {
        mockDrizzleDb.enqueue([])
        const result = await getBookingsForDateRange('court-1', new Date(), new Date())
        expect(result).toEqual([])
    })
})

// ─── getAvailableEquipment ────────────────────────────────────────────────────

describe('getAvailableEquipment', () => {
    it('returns empty array when no equipment found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getAvailableEquipment('badminton')).toEqual([])
    })

    it('marks equipment as in_use when reserved in overlapping booking', async () => {
        mockDrizzleDb.enqueue([
            { id: 'eq-1', name: 'Racket A', sport: 'badminton', condition: 'good', is_available: true },
            { id: 'eq-2', name: 'Racket B', sport: 'badminton', condition: 'good', is_available: true },
        ])
        mockDrizzleDb.enqueue([{ equipment_ids: ['eq-1'] }])

        const result = await getAvailableEquipment('badminton', futureTime(1), futureTime(2))
        const eq1 = result.find((e: any) => e.id === 'eq-1')
        const eq2 = result.find((e: any) => e.id === 'eq-2')
        expect(eq1?.in_use).toBe(true)
        expect(eq2?.in_use).toBe(false)
    })

    it('marks is_available=false equipment as in_use even without overlap', async () => {
        mockDrizzleDb.enqueue([
            { id: 'eq-3', name: 'Net', sport: 'badminton', condition: 'good', is_available: false },
        ])
        mockDrizzleDb.enqueue([]) // no overlapping bookings

        const result = await getAvailableEquipment('badminton', futureTime(1), futureTime(2))
        expect(result[0].in_use).toBe(true)
    })
})

// ─── createBooking ────────────────────────────────────────────────────────────

describe('createBooking', () => {
    it('rejects when startTime is in the past', async () => {
        const fd = makeFormData({ startTime: new Date(Date.now() - 60_000).toISOString() })
        const result = await createBooking(null, fd)
        expect(result.error).toBe('Cannot book a slot in the past')
    })

    it('rejects when user is not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any)
        const result = await createBooking(null, makeFormData())
        expect(result.error).toBe('Unauthorized')
    })

    it('rejects when student has an active 14-day time ban', async () => {
        const bannedUntil = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
        mockDrizzleDb.enqueue([{ banned_until: bannedUntil, priority_booking_remaining: 0 }])
        const result = await createBooking(null, makeFormData())
        expect(result.error).toMatch(/temporarily banned/)
    })

    it('rejects when student has 3+ violations (suspended)', async () => {
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue([{ count: 3 }])
        const result = await createBooking(null, makeFormData())
        expect(result.error).toMatch(/suspended/)
    })

    it('rejects when the time slot is already booked', async () => {
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue([{ id: 'existing-booking' }]) // court overlap
        const result = await createBooking(null, makeFormData())
        expect(result.error).toBe('Time slot is already booked')
    })

    it('rejects when student already has a booking in the same slot', async () => {
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue(NO_CONFLICTS)              // no court overlap
        mockDrizzleDb.enqueue([{ id: 'own-booking' }])  // student conflict
        const result = await createBooking(null, makeFormData())
        expect(result.error).toBe('You already have a booking during this time')
    })

    it('rejects when player count is below sport minimum', async () => {
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue(NO_CONFLICTS) // court overlap
        mockDrizzleDb.enqueue(NO_CONFLICTS) // student conflict
        mockDrizzleDb.enqueue([COURT_BADMINTON])
        const result = await createBooking(null, makeFormData({ numPlayers: '1' }))
        expect(result.error).toMatch(/Minimum 2 players/)
    })

    it('rejects when player count exceeds sport maximum', async () => {
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 4 })
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue([{ sport: 'table tennis', name: 'TT Court' }])
        const result = await createBooking(null, makeFormData({ numPlayers: '5' }))
        expect(result.error).toMatch(/Maximum 4 players/)
    })

    it('creates booking successfully with no players and no equipment', async () => {
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue([COURT_BADMINTON])
        mockDrizzleDb.enqueue([{ id: 'booking-new' }]) // insert returning

        const result = await createBooking(null, makeFormData())
        expect(result).toEqual({ success: true })
    })

    it('sends play request notifications to each invited player', async () => {
        const players = [{ id: 'student-2', full_name: 'Bob' }]
        mockDrizzleDb.enqueue([PROFILE_OK])                   // 1: profile ban
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)                 // 2: violations
        mockDrizzleDb.enqueue(NO_CONFLICTS)                    // 3: court overlap
        mockDrizzleDb.enqueue(NO_CONFLICTS)                    // 4: student conflict
        mockDrizzleDb.enqueue([                               // 5: player enrichment
            { id: 'student-2', full_name: 'Bob', branch: 'ECE', gender: 'male', year: '3' },
        ])
        mockDrizzleDb.enqueue([COURT_BADMINTON])              // 6: courts
        mockDrizzleDb.enqueue([{ id: 'booking-new' }])        // 7: insert booking
        mockDrizzleDb.enqueue([{ full_name: 'Alice' }])       // 8: booker profile
        mockDrizzleDb.enqueueEmpty()                           // 9: insert playRequests

        const fd = makeFormData({ numPlayers: '2', playersList: JSON.stringify(players) })
        await createBooking(null, fd)

        expect(vi.mocked(sendNotification)).toHaveBeenCalledTimes(1)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'student-2', type: 'play_request_received' })
        )
        expect(vi.mocked(notifyManagers)).toHaveBeenCalledTimes(1)
    })

    it('returns error and re-frees equipment if booking insert fails', async () => {
        mockDrizzleDb.enqueue([PROFILE_OK])
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue([COURT_BADMINTON])
        mockDrizzleDb.enqueue([{ id: 'eq-1' }]) // lock equipment returning → 1 locked
        mockDrizzleDb.enqueue([])               // insert booking returning → empty → fail
        mockDrizzleDb.enqueueEmpty()             // free equipment (no returning)

        const result = await createBooking(null, makeFormData({ equipmentIds: JSON.stringify(['eq-1']) }))
        expect(result.error).toBe('Failed to create booking')
    })

    it('consumes priority slot and notifies on 90-min booking', async () => {
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 1 }]) // has priority
        mockDrizzleDb.enqueue(VIOLATIONS_ZERO)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue(NO_CONFLICTS)
        mockDrizzleDb.enqueue([COURT_BADMINTON])
        mockDrizzleDb.enqueue([{ id: 'booking-90' }]) // insert booking
        mockDrizzleDb.enqueueEmpty()                    // update profiles (priority_booking_remaining=0)

        const result = await createBooking(null, makeFormData({ duration: '90' }))
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'priority_booking_used' })
        )
    })
})

// ─── cancelBooking ────────────────────────────────────────────────────────────

describe('cancelBooking', () => {
    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any)
        expect(await cancelBooking('b-1')).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when booking not found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await cancelBooking('b-1')).toEqual({ error: 'Booking not found' })
    })

    it('returns error when user does not own the booking', async () => {
        mockDrizzleDb.enqueue([{ ...BOOKING_ROW, user_id: 'someone-else' }])
        expect(await cancelBooking('b-1')).toEqual({ error: 'Not your booking' })
    })

    it('returns error for non-cancellable status (active)', async () => {
        mockDrizzleDb.enqueue([{ ...BOOKING_ROW, status: 'active' }])
        expect(await cancelBooking('b-1')).toEqual({ error: 'Cannot cancel this booking' })
    })

    it('applies -3 point penalty for late cancellation (within 3 hours)', async () => {
        const soonStart = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString()
        mockDrizzleDb.enqueue([{ ...BOOKING_ROW, start_time: soonStart }]) // booking
        // no equipment → skip equipment update
        mockDrizzleDb.enqueueEmpty() // db.execute (points penalty)
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)
        // no confirmed players → skip sendNotifications

        const result = await cancelBooking('b-1')
        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.execute).toHaveBeenCalled()
    })

    it('does NOT apply penalty for cancellation with plenty of notice (> 3 hours)', async () => {
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
        mockDrizzleDb.enqueue([{ ...BOOKING_ROW, start_time: farStart }])
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)

        const result = await cancelBooking('b-1')
        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.execute).not.toHaveBeenCalled()
    })

    it('frees equipment before cancelling', async () => {
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
        mockDrizzleDb.enqueue([{ ...BOOKING_ROW, start_time: farStart, equipment_ids: ['eq-1'] }])
        mockDrizzleDb.enqueueEmpty() // update equipment (free)
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)

        const result = await cancelBooking('b-1')
        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(2)
    })

    it('notifies confirmed players (N8) when booking is cancelled', async () => {
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
        mockDrizzleDb.enqueue([{
            ...BOOKING_ROW,
            start_time: farStart,
            players_list: [{ id: 'student-2', status: 'confirmed' }],
        }])
        mockDrizzleDb.enqueueEmpty() // update bookings

        await cancelBooking('b-1')
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ recipientId: 'student-2', type: 'booking_cancelled_by_booker' }),
            ])
        )
    })

    it('does NOT send N8 to pending-status players — only confirmed players notified', async () => {
        const farStart = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
        mockDrizzleDb.enqueue([{
            ...BOOKING_ROW,
            start_time: farStart,
            players_list: [
                { id: 'student-confirmed', status: 'confirmed' },
                { id: 'student-pending', status: 'pending' },
            ],
        }])
        mockDrizzleDb.enqueueEmpty()

        await cancelBooking('b-1')
        const calls = vi.mocked(sendNotifications).mock.calls
        expect(calls.length).toBeGreaterThan(0)
        const recipientIds = (calls[0][0] as any[]).map((n: any) => n.recipientId)
        expect(recipientIds).toContain('student-confirmed')
        expect(recipientIds).not.toContain('student-pending')
    })
})

// ─── withdrawFromBooking ──────────────────────────────────────────────────────

describe('withdrawFromBooking', () => {
    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any)
        expect(await withdrawFromBooking('b-1')).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when booking not found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await withdrawFromBooking('b-1')).toEqual({ error: 'Booking not found' })
    })

    it('returns error when the current user is the booker', async () => {
        // Global mock returns user 'student-1'; booking.user_id also 'student-1'
        mockDrizzleDb.enqueue([{ ...BOOKING_ROW, user_id: 'student-1' }])
        expect(await withdrawFromBooking('b-1')).toEqual({
            error: 'You are the booker. Use cancel instead.',
        })
    })

    it('sends N9 notification to the booker on successful withdrawal', async () => {
        // Current user is 'student-1' (the withdrawer); booker is 'student-booker'
        mockDrizzleDb.enqueue([{
            user_id: 'student-booker',
            status: 'confirmed',
            num_players: 3,
            players_list: [{ id: 'student-1', status: 'confirmed' }],
            equipment_ids: [],
            start_time: futureTime(2),
            courts: { sport: 'badminton', name: 'Ct A' },
        }])
        mockDrizzleDb.enqueueEmpty()                        // update bookings
        mockDrizzleDb.enqueue([{ full_name: 'Alice' }])    // withdrawer profile

        await withdrawFromBooking('b-1')
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'student-booker', type: 'player_withdrew' })
        )
    })

    it('auto-cancels booking when withdrawal drops players below minimum', async () => {
        // num_players=2, withdrawing leaves 1, min=2 → auto-cancel
        vi.mocked(getPlayerLimits).mockReturnValue({ min: 2, max: 6 })
        mockDrizzleDb.enqueue([{
            user_id: 'student-booker',
            status: 'confirmed',
            num_players: 2,
            players_list: [{ id: 'student-1', status: 'confirmed' }],
            equipment_ids: [],
            start_time: futureTime(2),
            courts: { sport: 'badminton', name: 'Ct A' },
        }])
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)

        const result = await withdrawFromBooking('b-1')
        expect(result).toMatchObject({ success: true, cancelled: true })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ recipientId: 'student-booker', type: 'booking_auto_cancelled' }),
            ])
        )
    })
})

// ─── searchStudents ───────────────────────────────────────────────────────────

describe('searchStudents', () => {
    it('returns empty for short query (< 2 chars)', async () => {
        expect(await searchStudents('a')).toEqual([])
    })

    it('returns matching students for a valid query', async () => {
        const student = {
            id: 'student-2',
            full_name: 'Alice',
            student_id: 'MT21001',
            branch: 'CSE',
            gender: 'female',
            year: '2',
            banned_until: null,
        }
        mockDrizzleDb.enqueue([student])
        const result = await searchStudents('Alice')
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('student-2')
    })

    it('returns empty array when no students match', async () => {
        mockDrizzleDb.enqueue([])
        const result = await searchStudents('Zzz')
        expect(result).toEqual([])
    })
})

// ─── studentEmergencyAlert ────────────────────────────────────────────────────

describe('studentEmergencyAlert', () => {
    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null as any)
        const result = await studentEmergencyAlert('b-1', 'Fire in the court')
        expect(result).toEqual({ error: 'Unauthorized' })
        expect(vi.mocked(notifyAdminsAndManagers)).not.toHaveBeenCalled()
    })

    it('inserts into feedback_complaints and fires notifyAdminsAndManagers on success', async () => {
        mockDrizzleDb.enqueueEmpty() // insert feedbackComplaints

        const result = await studentEmergencyAlert('b-1', 'Equipment is broken')
        expect(result).toEqual({ success: true })
        expect(vi.mocked(notifyAdminsAndManagers)).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'student_emergency_alert',
                data: expect.objectContaining({ booking_id: 'b-1' }),
            })
        )
    })

    it('sends the student-supplied reason in the notification body', async () => {
        mockDrizzleDb.enqueueEmpty()

        await studentEmergencyAlert('b-2', 'Lights not working')
        expect(vi.mocked(notifyAdminsAndManagers)).toHaveBeenCalledWith(
            expect.objectContaining({ body: 'Lights not working' })
        )
    })
})

// ─── getStudentBookings ───────────────────────────────────────────────────────

describe('getStudentBookings', () => {
    beforeEach(() => {
        vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u-1', email: 'student@iiitd.ac.in' })
    })

    function makeBooking(overrides: Record<string, any> = {}) {
        const now = Date.now()
        return {
            id: 'b-default',
            user_id: 'u-1',
            start_time: new Date(now - 60 * 60 * 1000).toISOString(),
            end_time: new Date(now + 60 * 60 * 1000).toISOString(),
            status: 'active',
            num_players: 2,
            equipment_ids: [],
            players_list: [],
            courts: { name: 'Ct A', sport: 'badminton' },
            ...overrides,
        }
    }

    it('active booking within its time window goes to current', async () => {
        const now = Date.now()
        const booking = makeBooking({
            id: 'b-active',
            status: 'active',
            start_time: new Date(now - 30 * 60 * 1000).toISOString(),
            end_time: new Date(now + 30 * 60 * 1000).toISOString(),
        })
        mockDrizzleDb.enqueue([booking])
        mockDrizzleDb.enqueue([])

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
        mockDrizzleDb.enqueue([booking])
        mockDrizzleDb.enqueue([])

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
        mockDrizzleDb.enqueue([booking])
        mockDrizzleDb.enqueue([])

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
        mockDrizzleDb.enqueue([booking])
        mockDrizzleDb.enqueue([])

        const { past } = await getStudentBookings('u-1')
        expect(past.map((b: any) => b.id)).toContain('b-completed')
    })

    it('cancelled and rejected bookings go to past', async () => {
        const now = Date.now()
        const cancelled = makeBooking({
            id: 'b-cancelled',
            status: 'cancelled',
            start_time: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
        })
        const rejected = makeBooking({
            id: 'b-rejected',
            status: 'rejected',
            start_time: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
            end_time: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
        })
        mockDrizzleDb.enqueue([cancelled, rejected])
        mockDrizzleDb.enqueue([])

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
        mockDrizzleDb.enqueue([booking]) // own query
        mockDrizzleDb.enqueue([booking]) // player query — same booking

        const { upcoming } = await getStudentBookings('u-1')
        expect(upcoming.filter((b: any) => b.id === 'b-dup')).toHaveLength(1)
    })
})
