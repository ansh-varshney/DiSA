import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'

vi.mock('@/lib/sports', () => ({
    generateCourtId: vi.fn(() => 'C-BAD1'),
    generateEquipmentId: vi.fn(() => '#bad1'),
}))
vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/storage', () => ({
    uploadFile: vi.fn().mockResolvedValue(null),
    deleteFile: vi.fn().mockResolvedValue(undefined),
}))

import { sendNotifications, broadcastToAllStudents } from '@/actions/notifications'
import {
    getEquipmentList,
    createEquipment,
    updateEquipment,
    deleteEquipment,
    getCourtsList,
    getAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    getReservations,
    getReservationsByDate,
    cancelReservation,
    getEquipmentBySport,
    forceCancelBooking,
    getBookingLogs,
    getFeedback,
    markFeedbackAsRead,
    updateComplaintStatus,
    getCoordinators,
    createCoordinator,
    updateCoordinator,
    deleteCoordinator,
    getViolations,
    deleteCourt,
    reserveForMaintenance,
} from '@/actions/admin'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function enqueueAdminRole() {
    mockDrizzleDb.enqueue([{ role: 'admin' }])
}

function enqueueForbiddenRole(role: 'student' | 'manager' = 'student') {
    mockDrizzleDb.enqueue([{ role }])
}

function makeEquipFormData(overrides: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('name', 'Test Racket')
    fd.set('sport', 'badminton')
    fd.set('condition', 'good')
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
    return fd
}

beforeEach(() => {
    mockDrizzleDb.reset()
    vi.mocked(sendNotifications).mockResolvedValue(undefined)
    vi.mocked(broadcastToAllStudents).mockResolvedValue(undefined)
})

// ─── getEquipmentList ─────────────────────────────────────────────────────────

describe('getEquipmentList', () => {
    it('returns all equipment without sport filter', async () => {
        enqueueAdminRole()
        const equip = [
            { id: 'e-1', name: 'Racket', sport: 'badminton' },
            { id: 'e-2', name: 'Ball', sport: 'tennis' },
        ]
        mockDrizzleDb.enqueue(equip)
        expect(await getEquipmentList()).toEqual(equip)
    })

    it('filters by sport when provided', async () => {
        enqueueAdminRole()
        const equip = [{ id: 'e-1', name: 'Racket', sport: 'badminton' }]
        mockDrizzleDb.enqueue(equip)
        expect(await getEquipmentList('badminton')).toEqual(equip)
    })

    it('returns all equipment when sport is "all"', async () => {
        enqueueAdminRole()
        const equip = [{ id: 'e-1', name: 'Racket', sport: 'badminton' }]
        mockDrizzleDb.enqueue(equip)
        expect(await getEquipmentList('all')).toEqual(equip)
    })

    it('returns empty array when no equipment found', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([])
        expect(await getEquipmentList()).toEqual([])
    })
})

// ─── createEquipment ──────────────────────────────────────────────────────────

describe('createEquipment', () => {
    it('creates equipment and returns it on success', async () => {
        const created = { id: 'eq-new', name: 'Test Racket', sport: 'badminton' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ equipCount: 0 }]) // count query
        mockDrizzleDb.enqueue([created]) // insert.returning()

        const result = await createEquipment(makeEquipFormData())
        expect(result).toMatchObject({ id: 'eq-new' })
    })

    it('throws when sport is missing', async () => {
        enqueueAdminRole()
        const fd = new FormData()
        fd.set('name', 'No Sport')
        await expect(createEquipment(fd)).rejects.toThrow('Sport is required')
    })

    it('throws when insert returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ equipCount: 0 }])
        mockDrizzleDb.enqueue([]) // empty returning → !newEquipment
        await expect(createEquipment(makeEquipFormData())).rejects.toThrow(
            'Failed to create equipment'
        )
    })
})

// ─── updateEquipment ──────────────────────────────────────────────────────────

describe('updateEquipment', () => {
    it('updates equipment and returns data', async () => {
        const updated = { id: 'e-1', name: 'Updated Racket', sport: 'badminton' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [], sport: 'badminton' }]) // existing select
        mockDrizzleDb.enqueue([updated]) // update.returning()

        const fd = makeEquipFormData({ name: 'Updated Racket', existingImages: '[]' })
        expect(await updateEquipment('e-1', fd)).toEqual(updated)
    })

    it('throws when update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [], sport: 'badminton' }])
        mockDrizzleDb.enqueue([]) // empty returning → throws

        const fd = makeEquipFormData({ existingImages: '[]' })
        await expect(updateEquipment('e-1', fd)).rejects.toThrow('Failed to update equipment')
    })
})

// ─── deleteEquipment ──────────────────────────────────────────────────────────

describe('deleteEquipment', () => {
    it('soft-deletes equipment (marks retired) and returns success', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [] }]) // select existing
        mockDrizzleDb.enqueueEmpty() // update set condition='retired'

        expect(await deleteEquipment('e-1')).toEqual({ success: true })
    })
})

// ─── getCourtsList ────────────────────────────────────────────────────────────

describe('getCourtsList', () => {
    it('returns all courts without filter', async () => {
        const courts = [{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }]
        mockDrizzleDb.enqueue(courts)
        expect(await getCourtsList()).toEqual(courts)
    })

    it('filters courts by sport', async () => {
        const courts = [{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }]
        mockDrizzleDb.enqueue(courts)
        expect(await getCourtsList('badminton')).toEqual(courts)
    })

    it('returns empty array when no courts found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getCourtsList()).toEqual([])
    })
})

// ─── getAnnouncements ─────────────────────────────────────────────────────────

describe('getAnnouncements', () => {
    it('returns announcements array', async () => {
        const rows = [
            { id: 'a-1', title: 'Test', content: 'Hello', created_at: new Date().toISOString() },
        ]
        mockDrizzleDb.enqueue(rows)
        expect(await getAnnouncements()).toEqual(rows)
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getAnnouncements()).toEqual([])
    })
})

// ─── updateAnnouncement ───────────────────────────────────────────────────────

describe('updateAnnouncement', () => {
    it('updates and returns announcement', async () => {
        const updated = { id: 'a-1', title: 'New', content: 'Updated' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([updated]) // update.returning()

        expect(await updateAnnouncement('a-1', 'New', 'Updated')).toEqual(updated)
    })

    it('throws when update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([])
        await expect(updateAnnouncement('a-1', 'T', 'B')).rejects.toThrow(
            'Failed to update announcement'
        )
    })
})

// ─── deleteAnnouncement ───────────────────────────────────────────────────────

describe('deleteAnnouncement', () => {
    it('deletes and returns success', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueEmpty() // delete (via then)

        expect(await deleteAnnouncement('a-1')).toEqual({ success: true })
    })
})

// ─── getReservations ──────────────────────────────────────────────────────────

describe('getReservations', () => {
    it('returns reservations array', async () => {
        const rows = [{ id: 'b-1', status: 'confirmed' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getReservations()).toEqual(rows)
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getReservations()).toEqual([])
    })

    it('accepts custom days parameter', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getReservations(7)).toEqual([])
    })
})

// ─── getReservationsByDate ────────────────────────────────────────────────────

describe('getReservationsByDate', () => {
    it('returns reservations for given sport and date', async () => {
        const rows = [{ id: 'b-1', status: 'confirmed' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getReservationsByDate('badminton', '2025-01-15')).toEqual(rows)
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getReservationsByDate('badminton', '2025-01-15')).toEqual([])
    })
})

// ─── cancelReservation ────────────────────────────────────────────────────────

describe('cancelReservation', () => {
    it('cancels booking and returns success', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                // select booking
                user_id: 'student-1',
                players_list: [],
                start_time: new Date().toISOString(),
                is_priority: false,
                is_maintenance: false,
                courts: { name: 'Ct A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // update bookings (cancel)
        // !is_priority && !is_maintenance → sendNotifications (mocked)

        expect(await cancelReservation('b-1')).toEqual({ success: true })
    })

    it('skips notifications for priority/maintenance bookings', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'student-1',
                players_list: [],
                start_time: new Date().toISOString(),
                is_priority: true,
                is_maintenance: false,
                courts: { name: 'Ct A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty()

        await cancelReservation('b-1')
        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })
})

// ─── getEquipmentBySport ──────────────────────────────────────────────────────

describe('getEquipmentBySport', () => {
    it('returns equipment for given sport', async () => {
        const equip = [{ id: 'e-1', name: 'Racket', sport: 'badminton' }]
        mockDrizzleDb.enqueue(equip)
        expect(await getEquipmentBySport('badminton')).toEqual(equip)
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getEquipmentBySport('tennis')).toEqual([])
    })
})

// ─── forceCancelBooking ───────────────────────────────────────────────────────

describe('forceCancelBooking', () => {
    it('updates booking status to cancelled and returns data', async () => {
        const updated = { id: 'b-1', status: 'cancelled' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                // select booking
                user_id: 'student-1',
                players_list: [],
                start_time: new Date().toISOString(),
                is_priority: false,
                is_maintenance: false,
                courts: { name: 'Ct A' },
            },
        ])
        mockDrizzleDb.enqueue([updated]) // update.returning()

        expect(await forceCancelBooking('b-1')).toEqual(updated)
        expect(vi.mocked(sendNotifications)).toHaveBeenCalled()
    })

    it('throws when update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'student-1',
                players_list: [],
                start_time: new Date().toISOString(),
                is_priority: false,
                is_maintenance: false,
                courts: { name: 'Ct A' },
            },
        ])
        mockDrizzleDb.enqueue([]) // empty → throws

        await expect(forceCancelBooking('b-1')).rejects.toThrow('Failed to cancel booking')
    })
})

// ─── getBookingLogs ───────────────────────────────────────────────────────────

describe('getBookingLogs', () => {
    it('returns empty array when no courts for sport', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getBookingLogs('badminton', '2025-01-15')).toEqual([])
    })

    it('returns empty array when no bookings found for courts', async () => {
        mockDrizzleDb.enqueue([{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }])
        mockDrizzleDb.enqueue([]) // no bookings
        expect(await getBookingLogs('badminton', '2025-01-15')).toEqual([])
    })

    it('returns enriched bookings with court and equipment data', async () => {
        mockDrizzleDb.enqueue([{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }]) // courts
        mockDrizzleDb.enqueue([
            {
                // bookings
                id: 'b-1',
                status: 'completed',
                court_id: 'c-1',
                start_time: '2025-01-15T10:00:00Z',
                end_time: '2025-01-15T11:00:00Z',
                num_players: 2,
                equipment_ids: ['e-1'],
                players_list: ['p-1'],
                is_priority: false,
                is_maintenance: false,
                created_at: '2025-01-15T09:00:00Z',
                profiles: { full_name: 'Alice', student_id: 'MT001', email: 'alice@test.com' },
            },
        ])
        mockDrizzleDb.enqueue([{ id: 'e-1', name: 'Racket', condition: 'good' }]) // equipment

        const result = await getBookingLogs('badminton', '2025-01-15')
        expect(result).toHaveLength(1)
        expect(result[0].courts).toEqual({ name: 'Badminton A', sport: 'badminton' })
        expect(result[0].equipment).toHaveLength(1)
        expect(result[0].equipment[0].id).toBe('e-1')
    })

    it('skips equipment query when no equipment_ids in bookings', async () => {
        mockDrizzleDb.enqueue([{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }])
        mockDrizzleDb.enqueue([
            {
                id: 'b-1',
                status: 'completed',
                court_id: 'c-1',
                start_time: '2025-01-15T10:00:00Z',
                end_time: '2025-01-15T11:00:00Z',
                num_players: 2,
                equipment_ids: [],
                players_list: [],
                is_priority: false,
                is_maintenance: false,
                created_at: '2025-01-15T09:00:00Z',
                profiles: { full_name: 'Alice', student_id: 'MT001', email: 'alice@test.com' },
            },
        ])
        // no equipment query since equipment_ids is empty

        const result = await getBookingLogs('badminton', '2025-01-15')
        expect(result).toHaveLength(1)
        expect(result[0].equipment).toEqual([])
    })
})

// ─── getFeedback ──────────────────────────────────────────────────────────────

describe('getFeedback', () => {
    it('returns all feedback without filters', async () => {
        const rows = [{ id: 'f-1', status: 'open', category: 'complaint' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getFeedback()).toEqual(rows)
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getFeedback()).toEqual([])
    })

    it('filters by status and category when provided', async () => {
        const rows = [{ id: 'f-1', status: 'open', category: 'complaint' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getFeedback('open', 'complaint')).toEqual(rows)
    })
})

// ─── markFeedbackAsRead ───────────────────────────────────────────────────────

describe('markFeedbackAsRead', () => {
    it('deletes feedback and returns success', async () => {
        mockDrizzleDb.enqueueEmpty() // delete (via then)
        expect(await markFeedbackAsRead('f-1')).toEqual({ success: true })
    })
})

// ─── updateComplaintStatus ────────────────────────────────────────────────────

describe('updateComplaintStatus', () => {
    it('updates status and returns data', async () => {
        const updated = { id: 'f-1', status: 'in_progress' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([updated]) // update.returning()

        expect(await updateComplaintStatus('f-1', 'in_progress')).toEqual(updated)
    })

    it('sets resolved_by and resolved_at when status is "resolved"', async () => {
        const updated = { id: 'f-1', status: 'resolved', resolved_by: 'student-1' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([updated])

        expect(await updateComplaintStatus('f-1', 'resolved')).toMatchObject({ status: 'resolved' })
    })

    it('throws when update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([])
        await expect(updateComplaintStatus('f-1', 'resolved')).rejects.toThrow(
            'Failed to update complaint status'
        )
    })
})

// ─── getCoordinators ──────────────────────────────────────────────────────────

describe('getCoordinators', () => {
    it('returns all coordinators without filter', async () => {
        const rows = [{ id: 'co-1', name: 'Alice', sport: 'badminton' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getCoordinators()).toEqual(rows)
    })

    it('filters by sport when provided', async () => {
        const rows = [{ id: 'co-1', name: 'Alice', sport: 'badminton' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getCoordinators('badminton')).toEqual(rows)
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getCoordinators()).toEqual([])
    })
})

// ─── createCoordinator ────────────────────────────────────────────────────────

describe('createCoordinator', () => {
    function makeCoordFormData() {
        const fd = new FormData()
        fd.set('name', 'Alice Coordinator')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')
        fd.set('email', 'alice@test.com')
        return fd
    }

    it('creates coordinator and returns data', async () => {
        const created = { id: 'co-1', name: 'Alice Coordinator' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([created]) // insert.returning()

        expect(await createCoordinator(makeCoordFormData())).toEqual(created)
    })

    it('throws when insert returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([])
        await expect(createCoordinator(makeCoordFormData())).rejects.toThrow(
            'Failed to create coordinator'
        )
    })
})

// ─── updateCoordinator ────────────────────────────────────────────────────────

describe('updateCoordinator', () => {
    it('updates coordinator and returns data', async () => {
        const updated = { id: 'co-1', name: 'Updated Name' }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([updated])

        const fd = new FormData()
        fd.set('name', 'Updated Name')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')

        expect(await updateCoordinator('co-1', fd)).toEqual(updated)
    })

    it('throws when update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([])

        const fd = new FormData()
        fd.set('name', 'Updated')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')

        await expect(updateCoordinator('co-1', fd)).rejects.toThrow('Failed to update coordinator')
    })
})

// ─── deleteCoordinator ────────────────────────────────────────────────────────

describe('deleteCoordinator', () => {
    it('deletes and returns success', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueEmpty() // delete (via then)

        expect(await deleteCoordinator('co-1')).toEqual({ success: true })
    })
})

// ─── getViolations ────────────────────────────────────────────────────────────

describe('getViolations', () => {
    it('returns all violations without filters', async () => {
        const rows = [{ id: 'v-1', violation_type: 'students_late', severity: 'minor' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getViolations()).toEqual(rows)
    })

    it('filters by severity when provided', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getViolations({ severity: 'major' })).toEqual([])
    })

    it('filters by violationType when provided', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getViolations({ violationType: 'students_late' })).toEqual([])
    })

    it('returns empty array when none found', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getViolations()).toEqual([])
    })

    it('skips severity filter when set to "all"', async () => {
        const rows = [{ id: 'v-1', violation_type: 'students_late', severity: 'minor' }]
        mockDrizzleDb.enqueue(rows)
        expect(await getViolations({ severity: 'all' })).toEqual(rows)
    })
})

// ─── deleteCourt ─────────────────────────────────────────────────────────────

describe('deleteCourt', () => {
    it('soft-deletes court (marks inactive) and returns data', async () => {
        const updated = { id: 'c-1', is_active: false }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [] }]) // select court
        mockDrizzleDb.enqueue([updated]) // update.returning()

        expect(await deleteCourt('c-1')).toEqual(updated)
    })

    it('throws when update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [] }])
        mockDrizzleDb.enqueue([])

        await expect(deleteCourt('c-1')).rejects.toThrow('Failed to delete court')
    })
})

// ─── reserveForMaintenance ────────────────────────────────────────────────────

describe('reserveForMaintenance', () => {
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    it('creates maintenance booking when no conflicts', async () => {
        const created = { id: 'b-maint', is_maintenance: true }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([]) // no conflicting bookings
        mockDrizzleDb.enqueue([created]) // insert.returning()

        expect(await reserveForMaintenance('court-1', futureDate, '09:00', '10:00')).toEqual(
            created
        )
    })

    it('cancels conflicting bookings and notifies students', async () => {
        const created = { id: 'b-maint', is_maintenance: true }
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                // 1 conflicting booking
                id: 'b-conflict',
                user_id: 'student-1',
                players_list: [],
                courts: { name: 'Ct A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // update conflicting booking (cancel)
        mockDrizzleDb.enqueue([created]) // insert maintenance booking.returning()

        const result = await reserveForMaintenance('court-1', futureDate, '09:00', '10:00')
        expect(result).toEqual(created)
        expect(vi.mocked(sendNotifications)).toHaveBeenCalled()
    })

    it('throws when insert returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([]) // no conflicts
        mockDrizzleDb.enqueue([]) // empty insert returning

        await expect(
            reserveForMaintenance('court-1', futureDate, '09:00', '10:00')
        ).rejects.toThrow('Failed to create maintenance reservation')
    })
})

// ─── verifyAdmin role rejection ────────────────────────────────────────────────

describe('verifyAdmin — role rejection', () => {
    it('rejects student token when calling createEquipment', async () => {
        enqueueForbiddenRole('student')
        const fd = makeEquipFormData()
        await expect(createEquipment(fd)).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling createEquipment', async () => {
        enqueueForbiddenRole('manager')
        const fd = makeEquipFormData()
        await expect(createEquipment(fd)).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling deleteEquipment', async () => {
        enqueueForbiddenRole('student')
        await expect(deleteEquipment('e-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling deleteCourt', async () => {
        enqueueForbiddenRole('student')
        await expect(deleteCourt('c-1')).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling forceCancelBooking', async () => {
        enqueueForbiddenRole('manager')
        await expect(forceCancelBooking('b-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling cancelReservation', async () => {
        enqueueForbiddenRole('student')
        await expect(cancelReservation('b-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling updateComplaintStatus', async () => {
        enqueueForbiddenRole('student')
        await expect(updateComplaintStatus('f-1', 'resolved')).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling createCoordinator', async () => {
        enqueueForbiddenRole('manager')
        const fd = new FormData()
        fd.set('name', 'Alice')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')
        fd.set('email', 'alice@test.com')
        await expect(createCoordinator(fd)).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling reserveForMaintenance', async () => {
        enqueueForbiddenRole('student')
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        await expect(
            reserveForMaintenance('court-1', futureDate, '09:00', '10:00')
        ).rejects.toThrow('Forbidden')
    })
})
