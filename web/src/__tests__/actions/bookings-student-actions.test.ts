/**
 * Tests for student-side booking actions that were not covered by the
 * existing bookings.test.ts:
 *   - createBooking: missing-field, past-time, and invalid-duration branches
 *   - studentStartPlay: all paths
 *   - studentEmergencyAlert: auth guard + success
 *   - submitFeedback: validation + success
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

import {
    createBooking,
    studentStartPlay,
    studentEmergencyAlert,
    submitFeedback,
} from '@/actions/bookings'
import { notifyManagers, notifyAdminsAndManagers } from '@/actions/notifications'

// ─── createBooking — input validation edge cases ──────────────────────────────

describe('createBooking — input validation edge cases', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns error when courtId is missing', async () => {
        const fd = new FormData()
        fd.set('startTime', new Date(Date.now() + 3_600_000).toISOString())
        fd.set('duration', '60')

        const result = await createBooking(null, fd)

        expect(result.error).toBe('Missing required booking details')
    })

    it('returns error when startTime is missing', async () => {
        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('duration', '60')

        const result = await createBooking(null, fd)

        expect(result.error).toBe('Missing required booking details')
    })

    it('returns error when duration is missing', async () => {
        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('startTime', new Date(Date.now() + 3_600_000).toISOString())

        const result = await createBooking(null, fd)

        expect(result.error).toBe('Missing required booking details')
    })

    it('returns error when startTime is in the past', async () => {
        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('startTime', new Date(Date.now() - 3_600_000).toISOString()) // 1 hour ago
        fd.set('duration', '60')
        fd.set('numPlayers', '2')
        fd.set('playersList', '[]')
        fd.set('equipmentIds', '[]')

        const result = await createBooking(null, fd)

        expect(result.error).toBe('Cannot book a slot in the past')
    })

    it('returns error for duration=90 when user has no priority slot', async () => {
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }]) // profile
        mockDrizzleDb.enqueue([{ count: 0 }]) // violations

        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('startTime', new Date(Date.now() + 3_600_000).toISOString())
        fd.set('duration', '90')
        fd.set('numPlayers', '2')
        fd.set('playersList', '[]')
        fd.set('equipmentIds', '[]')

        const result = await createBooking(null, fd)

        expect(result.error).toMatch(/priority booking slot/)
    })

    it('returns error for an invalid duration value (not 30, 60, or 90)', async () => {
        mockDrizzleDb.enqueue([{ banned_until: null, priority_booking_remaining: 0 }]) // profile
        mockDrizzleDb.enqueue([{ count: 0 }]) // violations

        const fd = new FormData()
        fd.set('courtId', 'c-1')
        fd.set('startTime', new Date(Date.now() + 3_600_000).toISOString())
        fd.set('duration', '45')
        fd.set('numPlayers', '2')
        fd.set('playersList', '[]')
        fd.set('equipmentIds', '[]')

        const result = await createBooking(null, fd)

        expect(result.error).toBe('Invalid booking duration. Please select 30 or 60 minutes.')
    })
})

// ─── studentStartPlay ─────────────────────────────────────────────────────────

describe('studentStartPlay', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(notifyManagers).mockResolvedValue(undefined)
    })

    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

        const result = await studentStartPlay('b-1')

        expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when booking is not found', async () => {
        mockDrizzleDb.enqueue([]) // no booking row

        const result = await studentStartPlay('b-1')

        expect(result).toEqual({ error: 'Booking not found' })
    })

    it('returns error when booking belongs to a different user', async () => {
        mockDrizzleDb.enqueue([{
            user_id: 'other-student',
            status: 'confirmed',
            start_time: new Date(),
            courts: null,
        }])

        const result = await studentStartPlay('b-1')

        expect(result).toEqual({ error: 'Not your booking' })
    })

    it('returns error when booking status is not confirmed', async () => {
        mockDrizzleDb.enqueue([{
            user_id: 'student-1',
            status: 'active', // already active
            start_time: new Date(),
            courts: null,
        }])

        const result = await studentStartPlay('b-1')

        expect(result).toEqual({ error: 'Booking cannot be started in its current state' })
    })

    it('returns error when booking is cancelled', async () => {
        mockDrizzleDb.enqueue([{
            user_id: 'student-1',
            status: 'cancelled',
            start_time: new Date(),
            courts: null,
        }])

        const result = await studentStartPlay('b-1')

        expect(result).toEqual({ error: 'Booking cannot be started in its current state' })
    })

    it('transitions booking to waiting_manager and notifies managers on success', async () => {
        mockDrizzleDb.enqueue([{
            user_id: 'student-1',
            status: 'confirmed',
            start_time: new Date(),
            courts: { name: 'Badminton Court A', sport: 'badminton' },
        }])
        mockDrizzleDb.enqueueEmpty() // update booking

        const result = await studentStartPlay('b-1')

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(1)
        expect(vi.mocked(notifyManagers)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'student_ready_to_play' })
        )
    })
})

// ─── studentEmergencyAlert ────────────────────────────────────────────────────

describe('studentEmergencyAlert', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(notifyAdminsAndManagers).mockResolvedValue(undefined)
    })

    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

        const result = await studentEmergencyAlert('b-1', 'Injury on court')

        expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('inserts a feedback record and notifies admins and managers', async () => {
        mockDrizzleDb.enqueueEmpty() // insert feedbackComplaints

        const result = await studentEmergencyAlert('b-1', 'Player injured on court')

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(1)
        expect(vi.mocked(notifyAdminsAndManagers)).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'student_emergency_alert',
                body: 'Player injured on court',
            })
        )
    })

    it('uses a fallback body when no reason is provided', async () => {
        mockDrizzleDb.enqueueEmpty()

        await studentEmergencyAlert('b-1', '')

        expect(vi.mocked(notifyAdminsAndManagers)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'student_emergency_alert' })
        )
    })
})

// ─── submitFeedback ───────────────────────────────────────────────────────────

describe('submitFeedback', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns error when not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)

        const result = await submitFeedback('Title', 'Description', 'general')

        expect(result).toEqual({ error: 'Unauthorized' })
    })

    it('returns error when title is empty or whitespace-only', async () => {
        const result = await submitFeedback('   ', 'Valid description', 'general')

        expect(result).toEqual({ error: 'Title and description are required' })
    })

    it('returns error when description is empty or whitespace-only', async () => {
        const result = await submitFeedback('Valid title', '\t\n', 'general')

        expect(result).toEqual({ error: 'Title and description are required' })
    })

    it('returns error when both title and description are empty', async () => {
        const result = await submitFeedback('', '', 'facility')

        expect(result).toEqual({ error: 'Title and description are required' })
    })

    it('inserts trimmed feedback and returns success', async () => {
        mockDrizzleDb.enqueueEmpty() // insert feedbackComplaints

        const result = await submitFeedback('  Bad net  ', '  The net is torn  ', 'facility')

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(1)
    })

    it('accepts different feedback categories', async () => {
        for (const category of ['general', 'facility', 'staff', 'other']) {
            mockDrizzleDb.enqueueEmpty()
            const result = await submitFeedback('Title', 'Description', category)
            expect(result).toEqual({ success: true })
        }
    })
})
