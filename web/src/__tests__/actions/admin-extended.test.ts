import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')
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

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

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

function chain(res: any = { data: null, error: null }) {
    const c: any = {}
    for (const m of [
        'select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'not', 'is', 'or',
        'gte', 'lte', 'lt', 'gt', 'ilike', 'order', 'limit', 'range', 'single',
    ]) {
        c[m] = vi.fn().mockReturnValue(c)
    }
    c.single = vi.fn().mockResolvedValue(res)
    c.then = (resolve: any) => Promise.resolve(res).then(resolve)
    return c
}

function makeAdminDb() {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    db.mockTable('profiles', { data: { role: 'admin' }, error: null })
    return db
}

// ─── getEquipmentList ─────────────────────────────────────────────────────────

describe('getEquipmentList', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns all equipment without sport filter', async () => {
        const db = makeMockDb()
        const equipment = [
            { id: 'e-1', name: 'Racket', sport: 'badminton' },
            { id: 'e-2', name: 'Ball', sport: 'tennis' },
        ]
        db.mockTable('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getEquipmentList()
        expect(result).toEqual(equipment)
    })

    it('filters by sport when provided', async () => {
        const db = makeMockDb()
        const equipment = [{ id: 'e-1', name: 'Racket', sport: 'badminton' }]
        db.mockTable('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getEquipmentList('badminton')
        expect(result).toEqual(equipment)
    })

    it('returns all equipment when sport is "all"', async () => {
        const db = makeMockDb()
        const equipment = [{ id: 'e-1', name: 'Racket', sport: 'badminton' }]
        db.mockTable('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getEquipmentList('all')
        expect(result).toEqual(equipment)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('equipment', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getEquipmentList()
        expect(result).toEqual([])
    })
})

// ─── createEquipment ──────────────────────────────────────────────────────────

describe('createEquipment', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeEquipFormData(overrides: Record<string, string> = {}) {
        const fd = new FormData()
        fd.set('name', 'Test Racket')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
        return fd
    }

    it('creates equipment and returns it on success', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'equipment') {
                // count query first, then insert
                const c = chain({ data: { id: 'eq-new', name: 'Test Racket' }, error: null })
                // make count work
                ;(c as any).count = 0
                return c
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        const result = await createEquipment(makeEquipFormData())
        expect(result).toMatchObject({ id: 'eq-new' })
    })

    it('throws when sport is missing', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'No Sport')

        await expect(createEquipment(fd)).rejects.toThrow('Sport is required')
    })

    it('throws when insert fails', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'equipment') return chain({ data: null, error: { message: 'insert error' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(createEquipment(makeEquipFormData())).rejects.toThrow('Failed to create equipment')
    })
})

// ─── updateEquipment ──────────────────────────────────────────────────────────

describe('updateEquipment', () => {
    beforeEach(() => vi.clearAllMocks())

    it('updates equipment and returns data', async () => {
        const db = makeAdminDb()
        const updated = { id: 'e-1', name: 'Updated Racket', sport: 'badminton' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'equipment') return chain({ data: updated, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Updated Racket')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        fd.set('existingImages', '[]')

        const result = await updateEquipment('e-1', fd)
        expect(result).toEqual(updated)
    })

    it('throws when update fails', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'equipment') return chain({ data: null, error: { message: 'update failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Updated')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        fd.set('existingImages', '[]')

        await expect(updateEquipment('e-1', fd)).rejects.toThrow('Failed to update equipment')
    })
})

// ─── deleteEquipment ──────────────────────────────────────────────────────────

describe('deleteEquipment', () => {
    beforeEach(() => vi.clearAllMocks())

    it('deletes equipment and returns success', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'equipment') return chain({ data: { pictures: [] }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await deleteEquipment('e-1')
        expect(result).toEqual({ success: true })
    })

    it('throws when delete fails', async () => {
        const db = makeAdminDb()
        const callCount = { count: 0 }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'equipment') {
                callCount.count++
                if (callCount.count === 1) return chain({ data: { pictures: [] }, error: null }) // select
                return chain({ data: null, error: { message: 'delete failed' } }) // delete
            }
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(deleteEquipment('e-1')).rejects.toThrow('Failed to delete equipment')
    })
})

// ─── getCourtsList ────────────────────────────────────────────────────────────

describe('getCourtsList', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns all courts without filter', async () => {
        const db = makeMockDb()
        const courts = [{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }]
        db.mockTable('courts', { data: courts, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCourtsList()
        expect(result).toEqual(courts)
    })

    it('filters courts by sport', async () => {
        const db = makeMockDb()
        const courts = [{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }]
        db.mockTable('courts', { data: courts, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCourtsList('badminton')
        expect(result).toEqual(courts)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCourtsList()
        expect(result).toEqual([])
    })
})

// ─── getAnnouncements ─────────────────────────────────────────────────────────

describe('getAnnouncements', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns announcements array', async () => {
        const db = makeMockDb()
        const announcements = [{ id: 'a-1', title: 'Test', content: 'Hello', created_at: new Date().toISOString() }]
        db.mockTable('announcements', { data: announcements, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getAnnouncements()
        expect(result).toEqual(announcements)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('announcements', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getAnnouncements()
        expect(result).toEqual([])
    })
})

// ─── updateAnnouncement ───────────────────────────────────────────────────────

describe('updateAnnouncement', () => {
    beforeEach(() => vi.clearAllMocks())

    it('updates and returns announcement', async () => {
        const db = makeAdminDb()
        const updated = { id: 'a-1', title: 'New', content: 'Updated' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements') return chain({ data: updated, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateAnnouncement('a-1', 'New', 'Updated')
        expect(result).toEqual(updated)
    })

    it('throws on update error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements') return chain({ data: null, error: { message: 'update failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(updateAnnouncement('a-1', 'T', 'B')).rejects.toThrow('Failed to update announcement')
    })
})

// ─── deleteAnnouncement ───────────────────────────────────────────────────────

describe('deleteAnnouncement', () => {
    beforeEach(() => vi.clearAllMocks())

    it('deletes and returns success', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements') return chain({ data: null, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await deleteAnnouncement('a-1')
        expect(result).toEqual({ success: true })
    })

    it('throws on delete error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements') return chain({ data: null, error: { message: 'delete failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(deleteAnnouncement('a-1')).rejects.toThrow('Failed to delete announcement')
    })
})

// ─── getReservations ──────────────────────────────────────────────────────────

describe('getReservations', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns reservations array', async () => {
        const db = makeMockDb()
        const reservations = [{ id: 'b-1', status: 'confirmed' }]
        db.mockTable('bookings', { data: reservations, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getReservations()
        expect(result).toEqual(reservations)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('bookings', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getReservations()
        expect(result).toEqual([])
    })

    it('accepts custom days parameter', async () => {
        const db = makeMockDb()
        db.mockTable('bookings', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getReservations(7)
        expect(result).toEqual([])
    })
})

// ─── getReservationsByDate ────────────────────────────────────────────────────

describe('getReservationsByDate', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns reservations for given sport and date', async () => {
        const db = makeMockDb()
        const reservations = [{ id: 'b-1', status: 'confirmed' }]
        db.mockTable('bookings', { data: reservations, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getReservationsByDate('badminton', '2025-01-15')
        expect(result).toEqual(reservations)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('bookings', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getReservationsByDate('badminton', '2025-01-15')
        expect(result).toEqual([])
    })
})

// ─── cancelReservation ────────────────────────────────────────────────────────

describe('cancelReservation', () => {
    beforeEach(() => vi.clearAllMocks())

    it('deletes booking and returns success', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'bookings') return chain({ data: null, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await cancelReservation('b-1')
        expect(result).toEqual({ success: true })
    })

    it('throws on delete error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'bookings') return chain({ data: null, error: { message: 'delete failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(cancelReservation('b-1')).rejects.toThrow('Failed to cancel reservation')
    })
})

// ─── getEquipmentBySport ──────────────────────────────────────────────────────

describe('getEquipmentBySport', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns equipment for given sport', async () => {
        const db = makeMockDb()
        const equipment = [{ id: 'e-1', name: 'Racket', sport: 'badminton' }]
        db.mockTable('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getEquipmentBySport('badminton')
        expect(result).toEqual(equipment)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('equipment', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getEquipmentBySport('tennis')
        expect(result).toEqual([])
    })
})

// ─── forceCancelBooking ───────────────────────────────────────────────────────

describe('forceCancelBooking', () => {
    beforeEach(() => vi.clearAllMocks())

    it('updates booking status to cancelled and returns data', async () => {
        const db = makeAdminDb()
        const updated = { id: 'b-1', status: 'cancelled' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'bookings') return chain({ data: updated, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await forceCancelBooking('b-1')
        expect(result).toEqual(updated)
    })

    it('throws on update error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'bookings') return chain({ data: null, error: { message: 'update failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(forceCancelBooking('b-1')).rejects.toThrow('Failed to cancel booking')
    })
})

// ─── getBookingLogs ───────────────────────────────────────────────────────────

describe('getBookingLogs', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns empty array when no courts for sport', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingLogs('badminton', '2025-01-15')
        expect(result).toEqual([])
    })

    it('returns empty array on courts DB error', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingLogs('badminton', '2025-01-15')
        expect(result).toEqual([])
    })

    it('returns enriched bookings with court, equipment, and player data', async () => {
        const db = makeMockDb()
        // Step 1: courts
        db.mockTableOnce('courts', {
            data: [{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }],
            error: null,
        })
        // Step 2: bookings
        db.mockTableOnce('bookings', {
            data: [
                {
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
            ],
            error: null,
        })
        // Step 3: equipment
        db.mockTableOnce('equipment', {
            data: [{ id: 'e-1', name: 'Racket', condition: 'good' }],
            error: null,
        })
        // Step 4: player profiles
        db.mockTableOnce('profiles', {
            data: [{ id: 'p-1', full_name: 'Bob', student_id: 'MT002', email: 'bob@test.com' }],
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingLogs('badminton', '2025-01-15')
        expect(result).toHaveLength(1)
        expect(result[0].courts).toEqual({ name: 'Badminton A', sport: 'badminton' })
        expect(result[0].equipment).toHaveLength(1)
        expect(result[0].players).toHaveLength(1)
    })

    it('returns empty array when no bookings found for courts', async () => {
        const db = makeMockDb()
        db.mockTableOnce('courts', {
            data: [{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }],
            error: null,
        })
        db.mockTableOnce('bookings', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBookingLogs('badminton', '2025-01-15')
        expect(result).toEqual([])
    })
})

// ─── getFeedback ──────────────────────────────────────────────────────────────

describe('getFeedback', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns all feedback without filters', async () => {
        const db = makeMockDb()
        const feedback = [{ id: 'f-1', status: 'open', category: 'complaint' }]
        db.mockTable('feedback_complaints', { data: feedback, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFeedback()
        expect(result).toEqual(feedback)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('feedback_complaints', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFeedback()
        expect(result).toEqual([])
    })

    it('filters by status and category when provided', async () => {
        const db = makeMockDb()
        const feedback = [{ id: 'f-1', status: 'open', category: 'complaint' }]
        db.mockTable('feedback_complaints', { data: feedback, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFeedback('open', 'complaint')
        expect(result).toEqual(feedback)
    })
})

// ─── markFeedbackAsRead ───────────────────────────────────────────────────────

describe('markFeedbackAsRead', () => {
    beforeEach(() => vi.clearAllMocks())

    it('deletes feedback and returns success', async () => {
        const db = makeMockDb()
        db.mockTable('feedback_complaints', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await markFeedbackAsRead('f-1')
        expect(result).toEqual({ success: true })
    })

    it('throws on delete error', async () => {
        const db = makeMockDb()
        db.mockTable('feedback_complaints', { data: null, error: { message: 'delete failed' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(markFeedbackAsRead('f-1')).rejects.toThrow('Failed to mark feedback as read')
    })
})

// ─── updateComplaintStatus ────────────────────────────────────────────────────

describe('updateComplaintStatus', () => {
    beforeEach(() => vi.clearAllMocks())

    it('updates status and returns data', async () => {
        const db = makeAdminDb()
        const updated = { id: 'f-1', status: 'in_progress' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'feedback_complaints') return chain({ data: updated, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateComplaintStatus('f-1', 'in_progress')
        expect(result).toEqual(updated)
    })

    it('sets resolved_by and resolved_at when status is "resolved"', async () => {
        const db = makeAdminDb()
        const updated = { id: 'f-1', status: 'resolved', resolved_by: 'admin-1' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'feedback_complaints') return chain({ data: updated, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateComplaintStatus('f-1', 'resolved')
        expect(result).toMatchObject({ status: 'resolved' })
    })

    it('throws on update error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'feedback_complaints') return chain({ data: null, error: { message: 'update failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(updateComplaintStatus('f-1', 'resolved')).rejects.toThrow('Failed to update complaint status')
    })
})

// ─── getCoordinators ──────────────────────────────────────────────────────────

describe('getCoordinators', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns all coordinators without filter', async () => {
        const db = makeMockDb()
        const coordinators = [{ id: 'co-1', name: 'Alice', sport: 'badminton' }]
        db.mockTable('coordinators', { data: coordinators, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCoordinators()
        expect(result).toEqual(coordinators)
    })

    it('filters by sport when provided', async () => {
        const db = makeMockDb()
        const coordinators = [{ id: 'co-1', name: 'Alice', sport: 'badminton' }]
        db.mockTable('coordinators', { data: coordinators, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCoordinators('badminton')
        expect(result).toEqual(coordinators)
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('coordinators', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCoordinators()
        expect(result).toEqual([])
    })
})

// ─── createCoordinator ────────────────────────────────────────────────────────

describe('createCoordinator', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeCoordFormData() {
        const fd = new FormData()
        fd.set('name', 'Alice Coordinator')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')
        fd.set('email', 'alice@test.com')
        return fd
    }

    it('creates coordinator and returns data', async () => {
        const db = makeAdminDb()
        const created = { id: 'co-1', name: 'Alice Coordinator' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'coordinators') return chain({ data: created, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createCoordinator(makeCoordFormData())
        expect(result).toEqual(created)
    })

    it('throws on insert error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'coordinators') return chain({ data: null, error: { message: 'insert error' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(createCoordinator(makeCoordFormData())).rejects.toThrow('Failed to create coordinator')
    })
})

// ─── updateCoordinator ────────────────────────────────────────────────────────

describe('updateCoordinator', () => {
    beforeEach(() => vi.clearAllMocks())

    it('updates coordinator and returns data', async () => {
        const db = makeAdminDb()
        const updated = { id: 'co-1', name: 'Updated Name' }
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'coordinators') return chain({ data: updated, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Updated Name')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')

        const result = await updateCoordinator('co-1', fd)
        expect(result).toEqual(updated)
    })

    it('throws on update error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'coordinators') return chain({ data: null, error: { message: 'update failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Updated')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')

        await expect(updateCoordinator('co-1', fd)).rejects.toThrow('Failed to update coordinator')
    })
})

// ─── deleteCoordinator ────────────────────────────────────────────────────────

describe('deleteCoordinator', () => {
    beforeEach(() => vi.clearAllMocks())

    it('deletes and returns success', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'coordinators') return chain({ data: null, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await deleteCoordinator('co-1')
        expect(result).toEqual({ success: true })
    })

    it('throws on delete error', async () => {
        const db = makeAdminDb()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'coordinators') return chain({ data: null, error: { message: 'delete failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(deleteCoordinator('co-1')).rejects.toThrow('Failed to delete coordinator')
    })
})

// ─── getViolations ────────────────────────────────────────────────────────────

describe('getViolations', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns all violations without filters', async () => {
        const db = makeMockDb()
        const violations = [{ id: 'v-1', violation_type: 'students_late', severity: 'minor' }]
        db.mockTable('student_violations', { data: violations, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getViolations()
        expect(result).toEqual(violations)
    })

    it('filters by severity when provided', async () => {
        const db = makeMockDb()
        db.mockTable('student_violations', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getViolations({ severity: 'major' })
        expect(result).toEqual([])
    })

    it('filters by violationType when provided', async () => {
        const db = makeMockDb()
        db.mockTable('student_violations', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getViolations({ violationType: 'students_late' })
        expect(result).toEqual([])
    })

    it('returns empty array on error', async () => {
        const db = makeMockDb()
        db.mockTable('student_violations', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getViolations()
        expect(result).toEqual([])
    })

    it('skips severity filter when set to "all"', async () => {
        const db = makeMockDb()
        const violations = [{ id: 'v-1', violation_type: 'students_late', severity: 'minor' }]
        db.mockTable('student_violations', { data: violations, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getViolations({ severity: 'all' })
        expect(result).toEqual(violations)
    })
})

// ─── verifyAdmin role rejection (equipment / court / booking mutations) ────────

describe('verifyAdmin — role rejection (mutations)', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeNonAdminDb(role: 'student' | 'manager') {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role }, error: null })
            return chain()
        })
        return db
    }

    it('rejects student token when calling createEquipment', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Racket')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        await expect(createEquipment(fd)).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling createEquipment', async () => {
        const db = makeNonAdminDb('manager')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Racket')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        await expect(createEquipment(fd)).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling deleteEquipment', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(deleteEquipment('e-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling deleteCourt', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(deleteCourt('c-1')).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling forceCancelBooking', async () => {
        const db = makeNonAdminDb('manager')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(forceCancelBooking('b-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling cancelReservation', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(cancelReservation('b-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling updateComplaintStatus', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(updateComplaintStatus('f-1', 'resolved')).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling createCoordinator', async () => {
        const db = makeNonAdminDb('manager')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'Alice')
        fd.set('role', 'head')
        fd.set('sport', 'badminton')
        fd.set('email', 'alice@test.com')
        await expect(createCoordinator(fd)).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling reserveForMaintenance', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        await expect(reserveForMaintenance('court-1', futureDate, '09:00', '10:00')).rejects.toThrow('Forbidden')
    })
})
