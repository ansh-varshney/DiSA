/**
 * Tests for manager read/utility actions that had 0% coverage:
 *   - getCurrentBookings  (lines 123–190 in manager.ts)
 *   - getUnderMaintenanceCourts (lines 192–248)
 *   - updateEquipmentConditions (lines 642–650)
 *
 * None of these call requireManagerRole() — they rely on route-level
 * middleware protection. The DB is mocked via mockDrizzleDb.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import {
    getCurrentBookings,
    getUnderMaintenanceCourts,
    updateEquipmentConditions,
} from '@/actions/manager'

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('n-1'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
}))

// ─── getCurrentBookings ───────────────────────────────────────────────────────

describe('getCurrentBookings', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns empty array when no bookings exist in the next 24 h window', async () => {
        mockDrizzleDb.enqueue([]) // booking query → empty

        const result = await getCurrentBookings()

        expect(result).toEqual([])
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1) // only the booking query
    })

    it('returns bookings with equipment names resolved from ids', async () => {
        const bookingRow = {
            id: 'b-1',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(),
            end_time: new Date(Date.now() + 3_600_000),
            status: 'confirmed',
            players_list: [],
            equipment_ids: ['eq-1', 'eq-2'],
            is_maintenance: false,
            is_priority: false,
            num_players: 2,
            notes: '',
            created_at: new Date(),
            profiles: { full_name: 'Alice', role: 'student' },
            courts: { name: 'Badminton A', sport: 'badminton' },
        }
        mockDrizzleDb.enqueue([bookingRow]) // bookings
        mockDrizzleDb.enqueue([
            { id: 'eq-1', name: 'Racket' },
            { id: 'eq-2', name: 'Shuttle' },
        ]) // equipment lookup

        const result = await getCurrentBookings()

        expect(result).toHaveLength(1)
        expect((result[0] as any).equipment_names).toContain('Racket')
        expect((result[0] as any).equipment_names).toContain('Shuttle')
    })

    it('skips the equipment lookup when all bookings have no equipment', async () => {
        const bookingRow = {
            id: 'b-2',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(),
            end_time: new Date(Date.now() + 3_600_000),
            status: 'confirmed',
            players_list: [],
            equipment_ids: [], // empty — no equipment query needed
            is_maintenance: false,
            is_priority: false,
            num_players: 2,
            notes: '',
            created_at: new Date(),
            profiles: { full_name: 'Bob', role: 'student' },
            courts: { name: 'Tennis A', sport: 'tennis' },
        }
        mockDrizzleDb.enqueue([bookingRow])
        // No second enqueue — the equipment select must NOT be called

        const result = await getCurrentBookings()

        expect(result).toHaveLength(1)
        expect((result[0] as any).equipment_names).toEqual([])
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1) // only booking query
    })

    it('returns bookings with unknown equipment ids mapped to undefined (filtered out)', async () => {
        const bookingRow = {
            id: 'b-3',
            user_id: 's-1',
            court_id: 'c-1',
            start_time: new Date(),
            end_time: new Date(Date.now() + 3_600_000),
            status: 'active',
            players_list: [],
            equipment_ids: ['eq-missing'],
            is_maintenance: false,
            is_priority: false,
            num_players: 2,
            notes: '',
            created_at: new Date(),
            profiles: { full_name: 'Carol', role: 'student' },
            courts: { name: 'Squash A', sport: 'squash' },
        }
        mockDrizzleDb.enqueue([bookingRow])
        mockDrizzleDb.enqueue([]) // equipment not found

        const result = await getCurrentBookings()

        expect(result).toHaveLength(1)
        expect((result[0] as any).equipment_names).toEqual([])
    })
})

// ─── getUnderMaintenanceCourts ────────────────────────────────────────────────

describe('getUnderMaintenanceCourts', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns empty array when no courts are inactive and no maintenance bookings', async () => {
        mockDrizzleDb.enqueue([]) // courtRows (inactive/notes)
        mockDrizzleDb.enqueue([]) // maintenanceBookings

        const result = await getUnderMaintenanceCourts()

        expect(result).toEqual([])
    })

    it('includes disabled courts (is_active=false) in the result', async () => {
        const disabledCourt = {
            id: 'c-1',
            name: 'Court 1',
            sport: 'badminton',
            is_active: false,
            maintenance_notes: null,
            pictures: [],
            condition: 'good',
        }
        mockDrizzleDb.enqueue([disabledCourt]) // courtRows
        mockDrizzleDb.enqueue([]) // no maintenance bookings today

        const result = await getUnderMaintenanceCourts()

        expect(result).toHaveLength(1)
        expect((result[0] as any).id).toBe('c-1')
        expect((result[0] as any).is_booking_slot).toBe(false)
    })

    it('includes courts with maintenance_notes as disabled', async () => {
        const courtWithNotes = {
            id: 'c-2',
            name: 'Court 2',
            sport: 'tennis',
            is_active: true,
            maintenance_notes: 'Net replacement in progress',
            pictures: [],
            condition: 'fair',
        }
        mockDrizzleDb.enqueue([courtWithNotes])
        mockDrizzleDb.enqueue([])

        const result = await getUnderMaintenanceCourts()

        expect(result).toHaveLength(1)
        expect((result[0] as any).is_booking_slot).toBe(false)
    })

    it('includes today maintenance booking slots with is_booking_slot=true', async () => {
        mockDrizzleDb.enqueue([]) // no permanently disabled courts
        const maintenanceBooking = {
            id: 'b-maint',
            court_id: 'c-3',
            start_time: new Date(),
            end_time: new Date(Date.now() + 3_600_000),
            courts: { id: 'c-3', name: 'Football A', sport: 'football' },
        }
        mockDrizzleDb.enqueue([maintenanceBooking])

        const result = await getUnderMaintenanceCourts()

        expect(result).toHaveLength(1)
        expect((result[0] as any).is_booking_slot).toBe(true)
        expect((result[0] as any).maintenance_notes).toBe('Scheduled Maintenance')
    })

    it('returns both disabled courts and maintenance booking slots together', async () => {
        const disabledCourt = {
            id: 'c-1',
            name: 'Court 1',
            sport: 'badminton',
            is_active: false,
            maintenance_notes: null,
        }
        const maintenanceBooking = {
            id: 'b-maint',
            court_id: 'c-2',
            start_time: new Date(),
            end_time: new Date(Date.now() + 3_600_000),
            courts: { id: 'c-2', name: 'Tennis A', sport: 'tennis' },
        }
        mockDrizzleDb.enqueue([disabledCourt])
        mockDrizzleDb.enqueue([maintenanceBooking])

        const result = await getUnderMaintenanceCourts()

        expect(result).toHaveLength(2)
        const slots = result.map((r: any) => r.is_booking_slot)
        expect(slots).toContain(true)
        expect(slots).toContain(false)
    })
})

// ─── updateEquipmentConditions ────────────────────────────────────────────────

describe('updateEquipmentConditions', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns success for an empty conditions list without touching the DB', async () => {
        const result = await updateEquipmentConditions([])

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.update).not.toHaveBeenCalled()
    })

    it('issues one update call per equipment item', async () => {
        mockDrizzleDb.enqueueEmpty() // eq-1
        mockDrizzleDb.enqueueEmpty() // eq-2
        mockDrizzleDb.enqueueEmpty() // eq-3

        const result = await updateEquipmentConditions([
            { id: 'eq-1', condition: 'good' },
            { id: 'eq-2', condition: 'minor_damage' },
            { id: 'eq-3', condition: 'damaged' },
        ])

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(3)
    })

    it('returns success for a single item', async () => {
        mockDrizzleDb.enqueueEmpty()

        const result = await updateEquipmentConditions([
            { id: 'eq-1', condition: 'minor_damage' },
        ])

        expect(result).toEqual({ success: true })
        expect(mockDrizzleDb.update).toHaveBeenCalledTimes(1)
    })
})
