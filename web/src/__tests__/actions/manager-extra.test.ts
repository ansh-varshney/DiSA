/**
 * Tests for manager actions with previously uncovered branches:
 *   - getBookingDetails: equipment_ids lookup (line 450) + additional players (lines 468-473)
 *   - getPendingBookings: basic happy path (line 250)
 *   - emergencyEndSession: success path (lines 615-633)
 *   - reportLostEquipment: impacted future bookings loop (lines 687-697)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('n-1'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
}))

import {
    getBookingDetails,
    getPendingBookings,
    emergencyEndSession,
    reportLostEquipment,
} from '@/actions/manager'

// ─── getBookingDetails — equipment + additional players ───────────────────────

describe('getBookingDetails — equipment and players', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns null when the booking does not exist', async () => {
        mockDrizzleDb.enqueue([]) // no booking row

        const result = await getBookingDetails('b-missing')

        expect(result).toBeNull()
    })

    it('fetches equipment details when equipment_ids is non-empty', async () => {
        const bkRow = {
            id: 'b-1',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(Date.now() + 3_600_000), // future — no lazy expiry
            end_time: new Date(Date.now() + 7_200_000),
            status: 'confirmed',
            players_list: [],
            equipment_ids: ['eq-1', 'eq-2'],
            is_maintenance: false,
            is_priority: false,
            num_players: 2,
            notes: '',
            created_at: new Date(),
            profiles: { id: 's-1', full_name: 'Alice', role: 'student' },
            courts: { id: 'c-1', name: 'Badminton A', sport: 'badminton' },
        }
        mockDrizzleDb.enqueue([bkRow]) // booking query
        mockDrizzleDb.enqueue([
            { id: 'eq-1', name: 'Racket', condition: 'good' },
            { id: 'eq-2', name: 'Shuttle', condition: 'good' },
        ]) // equipment select

        const result = await getBookingDetails('b-1')

        expect(result).not.toBeNull()
        expect((result as any).equipment).toHaveLength(2)
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(2) // booking + equipment
    })

    it('skips equipment query when equipment_ids is empty', async () => {
        const bkRow = {
            id: 'b-2',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(Date.now() + 3_600_000),
            end_time: new Date(Date.now() + 7_200_000),
            status: 'confirmed',
            players_list: [],
            equipment_ids: [],
            is_maintenance: false,
            is_priority: false,
            num_players: 1,
            notes: '',
            created_at: new Date(),
            profiles: { id: 's-1', full_name: 'Bob', role: 'student' },
            courts: { id: 'c-1', name: 'Tennis A', sport: 'tennis' },
        }
        mockDrizzleDb.enqueue([bkRow])
        // No second enqueue — equipment query must NOT be called

        const result = await getBookingDetails('b-2')

        expect((result as any).equipment).toEqual([])
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1)
    })

    it('fetches additional player profiles when players_list is non-empty', async () => {
        const bkRow = {
            id: 'b-3',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(Date.now() + 3_600_000),
            end_time: new Date(Date.now() + 7_200_000),
            status: 'confirmed',
            players_list: [
                { id: 's-2', status: 'confirmed' },
                { id: 's-3', status: 'confirmed' },
            ],
            equipment_ids: [],
            is_maintenance: false,
            is_priority: false,
            num_players: 3,
            notes: '',
            created_at: new Date(),
            profiles: { id: 's-1', full_name: 'Alice', role: 'student' },
            courts: { id: 'c-1', name: 'Squash A', sport: 'squash' },
        }
        mockDrizzleDb.enqueue([bkRow]) // booking
        // equipment query skipped (empty ids)
        mockDrizzleDb.enqueue([
            { id: 's-2', full_name: 'Bob', role: 'student' },
            { id: 's-3', full_name: 'Carol', role: 'student' },
        ]) // additional players

        const result = await getBookingDetails('b-3')

        expect((result as any).all_players).toHaveLength(3) // booker + 2 additional
        const names = (result as any).all_players.map((p: any) => p.full_name)
        expect(names).toContain('Alice')
        expect(names).toContain('Bob')
        expect(names).toContain('Carol')
    })
})

// ─── getPendingBookings ───────────────────────────────────────────────────────

describe('getPendingBookings', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns empty array when there are no pending bookings', async () => {
        mockDrizzleDb.enqueue([])

        const result = await getPendingBookings()

        expect(result).toEqual([])
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1)
    })

    it('returns pending booking rows', async () => {
        const bookingRow = {
            id: 'b-1',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(),
            end_time: new Date(Date.now() + 3_600_000),
            status: 'pending_confirmation',
            players_list: [],
            equipment_ids: [],
            is_maintenance: false,
            is_priority: false,
            num_players: 2,
            notes: '',
            created_at: new Date(),
            profiles: { full_name: 'Alice', phone_number: '9876543210', student_id: 'MT23001' },
            courts: { name: 'Badminton A', sport: 'badminton' },
        }
        mockDrizzleDb.enqueue([bookingRow])

        const result = await getPendingBookings()

        expect(result).toHaveLength(1)
        expect((result[0] as any).status).toBe('pending_confirmation')
    })
})

// ─── emergencyEndSession ──────────────────────────────────────────────────────

describe('emergencyEndSession', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns error when manager role check fails', async () => {
        // requireManagerRole returns error when profile is missing
        mockDrizzleDb.enqueue([]) // no profile found

        const result = await emergencyEndSession('b-1', 'Safety hazard')

        expect((result as any).error).toBeTruthy()
    })

    it('completes session, inserts feedback, and notifies on success', async () => {
        const { sendNotifications, notifyAdmins } = await import('@/actions/notifications')

        // requireManagerRole: profile with manager role
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        // freeBookingEquipment → select equipment_ids
        mockDrizzleDb.enqueue([{ equipment_ids: [] }])
        // update booking status=completed
        mockDrizzleDb.enqueueEmpty()
        // cancelPendingPlayRequests: select playRequests
        mockDrizzleDb.enqueueEmpty()
        // insert feedbackComplaints
        mockDrizzleDb.enqueueEmpty()
        // getBookingStudentIds → select booking for user_id + players_list
        mockDrizzleDb.enqueue([{ user_id: 's-1', players_list: [] }])
        // getBookingStudentIds → select student profiles (filters role=student)
        mockDrizzleDb.enqueue([{ id: 's-1' }])
        // getBookingForNotif → select booking with court
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                user_id: 's-1',
                courts: { name: 'Badminton A', sport: 'badminton' },
                players_list: [],
            },
        ])

        const result = await emergencyEndSession('b-1', 'Safety hazard')

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.insert).toHaveBeenCalledTimes(1)
        expect(vi.mocked(notifyAdmins)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'emergency_alert' })
        )
    })
})

// ─── reportLostEquipment — impacted future bookings ───────────────────────────

describe('reportLostEquipment — future booking cleanup', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns error when not authorized as manager', async () => {
        mockDrizzleDb.enqueue([]) // no profile

        const result = await reportLostEquipment('b-1', ['eq-1'], ['s-1'])

        expect((result as any).error).toBeTruthy()
    })

    it('removes lost equipment from impacted future bookings', async () => {
        // requireManagerRole
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        // select equipment items
        mockDrizzleDb.enqueue([{ id: 'eq-lost', name: 'Racket', equipment_id: 'R-01' }])
        // update equipment is_available=false, condition=lost
        mockDrizzleDb.enqueueEmpty()
        // futureBookings: one booking that uses eq-lost
        mockDrizzleDb.enqueue([
            {
                id: 'b-future',
                user_id: 's-2',
                equipment_ids: ['eq-lost', 'eq-other'],
                start_time: new Date(Date.now() + 86_400_000),
            },
        ])
        // update impacted booking to remove eq-lost from equipment_ids
        mockDrizzleDb.enqueueEmpty()
        // playerIds.length > 0: insert violations
        mockDrizzleDb.enqueueEmpty()
        // select student profiles where role=student
        mockDrizzleDb.enqueue([{ id: 's-1' }])
        // applyPoints: db.execute for each student (pops from queue)
        mockDrizzleDb.enqueueEmpty()

        const result = await reportLostEquipment('b-1', ['eq-lost'], ['s-1'])

        expect(result).toEqual(expect.objectContaining({ success: true, impactedBookingsCount: 1 }))
        // equipment update + impacted booking update + applyPoints update = 3 calls
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(3)
    })

    it('does not update any future booking when none are impacted', async () => {
        // requireManagerRole
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        // equipment items
        mockDrizzleDb.enqueue([{ id: 'eq-lost', name: 'Shuttle', equipment_id: 'S-01' }])
        // update equipment is_available=false, condition=lost
        mockDrizzleDb.enqueueEmpty()
        // futureBookings: none use the lost equipment (different equipment id)
        mockDrizzleDb.enqueue([
            {
                id: 'b-other',
                user_id: 's-2',
                equipment_ids: ['eq-unrelated'],
                start_time: new Date(Date.now() + 86_400_000),
            },
        ])
        // playerIds=[] → skip violation insert block entirely

        const result = await reportLostEquipment('b-1', ['eq-lost'], [])

        expect(result).toEqual(expect.objectContaining({ success: true, impactedBookingsCount: 0 }))
        // Only one update call: marking equipment as lost
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(1)
    })
})
