import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb, FIXTURES } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')
vi.mock('@/lib/sports', () => ({
    generateCourtId: vi.fn(() => 'CRT-001'),
    generateEquipmentId: vi.fn(() => 'EQ-001'),
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
    sendNotification,
    sendNotifications,
    broadcastToAllStudents,
} from '@/actions/notifications'

import {
    getDefaulterStudents,
    removeStudentFromDefaulters,
    adjustStudentPoints,
    createAnnouncement,
    priorityReserveSlot,
    getDashboardStats,
    forceCancelBooking,
} from '@/actions/admin'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function chain(res: any = { data: null, error: null }) {
    const c: any = {}
    for (const m of [
        'select',
        'insert',
        'update',
        'delete',
        'eq',
        'neq',
        'in',
        'not',
        'or',
        'is',
        'gte',
        'lte',
        'lt',
        'gt',
        'ilike',
        'order',
        'limit',
        'range',
        'single',
    ]) {
        c[m] = vi.fn().mockReturnValue(c)
    }
    c.single = vi.fn().mockResolvedValue(res)
    c.then = (resolve: any) => Promise.resolve(res).then(resolve)
    return c
}

function makeAdminSession() {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    db.mockTable('profiles', { data: { role: 'admin' }, error: null })
    return db
}

// ─── getDefaulterStudents ─────────────────────────────────────────────────────

describe('getDefaulterStudents', () => {
    it('returns empty array when no violations', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTable('student_violations', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getDefaulterStudents()
        expect(result).toEqual([])
    })

    it('groups multiple violations for the same student', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.mockTable('student_violations', {
            data: [
                {
                    student_id: 'student-1',
                    violation_type: 'students_late',
                    severity: 'minor',
                    created_at: new Date().toISOString(),
                    reported_by: null,
                    reason: 'came late',
                    profiles: {
                        full_name: 'Alice',
                        student_id: 'MT23001',
                        email: 'alice@iiitd.ac.in',
                        phone_number: '9876543210',
                        banned_until: null,
                    },
                },
                {
                    student_id: 'student-1',
                    violation_type: 'improper_gear',
                    severity: 'minor',
                    created_at: new Date().toISOString(),
                    reported_by: null,
                    reason: 'no shoes',
                    profiles: {
                        full_name: 'Alice',
                        student_id: 'MT23001',
                        email: 'alice@iiitd.ac.in',
                        phone_number: '9876543210',
                        banned_until: null,
                    },
                },
            ],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getDefaulterStudents()
        expect(result).toHaveLength(1)
        expect(result[0].total_violations).toBe(2)
    })

    it('correctly identifies late_arrival_count and banned_until fields', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        const bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
        const makeViolation = (type: string) => ({
            student_id: 'student-1',
            violation_type: type,
            severity: 'minor',
            created_at: new Date().toISOString(),
            reported_by: null,
            reason: 'came late',
            profiles: {
                full_name: 'Bob',
                student_id: 'MT23002',
                email: 'bob@iiitd.ac.in',
                phone_number: null,
                banned_until: bannedUntil,
            },
        })
        adminDb.mockTable('student_violations', {
            data: [
                makeViolation('students_late'),
                makeViolation('students_late'),
                makeViolation('students_late'),
            ],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getDefaulterStudents()
        expect(result[0].late_arrival_count).toBe(3)
        // banned_until is set (not null) — the component derives is_banned from this
        expect(result[0].banned_until).toBe(bannedUntil)
        expect(new Date(result[0].banned_until!).getTime()).toBeGreaterThan(Date.now())
    })
})

// ─── removeStudentFromDefaulters ──────────────────────────────────────────────

describe('removeStudentFromDefaulters', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls clear_student_defaulter RPC and sends N17 notification', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: null })
        // N17 notification insert
        adminDb.mockTable('notifications', { data: { id: 'n-17' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await removeStudentFromDefaulters('student-1')
        expect(result).toEqual({ success: true })
        expect(adminDb.rpc).toHaveBeenCalledWith('clear_student_defaulter', {
            p_student_id: 'student-1',
        })
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientId: 'student-1',
                type: 'defaulter_cleared',
            })
        )
    })

    it('throws when RPC fails', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: { message: 'RPC failed' } })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await expect(removeStudentFromDefaulters('student-1')).rejects.toThrow('RPC failed')
    })
})

// ─── adjustStudentPoints ──────────────────────────────────────────────────────

describe('adjustStudentPoints', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls update_student_points RPC with correct delta', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: null })
        adminDb.mockTable('notifications', { data: { id: 'n-18' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await adjustStudentPoints('student-1', 15)
        expect(adminDb.rpc).toHaveBeenCalledWith('update_student_points', {
            p_student_id: 'student-1',
            p_delta: 15,
        })
    })

    it('sends N18 notification with signed delta string', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: null })
        adminDb.mockTable('notifications', { data: { id: 'n-18' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await adjustStudentPoints('student-1', -10)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({
                recipientId: 'student-1',
                type: 'points_adjusted',
                body: expect.stringContaining('-10'),
            })
        )
    })

    it('shows + sign for positive adjustments', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: null })
        adminDb.mockTable('notifications', { data: { id: 'n-18' }, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await adjustStudentPoints('student-1', 20)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ body: expect.stringContaining('+20') })
        )
    })

    it('throws when RPC fails', async () => {
        const db = makeAdminSession()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: { message: 'RPC error' } })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await expect(adjustStudentPoints('student-1', 5)).rejects.toThrow('RPC error')
    })
})

// ─── createAnnouncement ───────────────────────────────────────────────────────

describe('createAnnouncement', () => {
    beforeEach(() => vi.clearAllMocks())

    it('inserts announcement and broadcasts N24 to all students', async () => {
        const db = makeAdminSession()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements')
                return chain({
                    data: { id: 'ann-1', title: 'Test', content: 'Hello' },
                    error: null,
                })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const adminDb = makeMockDb()
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await createAnnouncement('Test', 'Hello all students')
        expect(result).toMatchObject({ id: 'ann-1' })
        expect(vi.mocked(broadcastToAllStudents)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'announcement', title: 'Announcement: Test' })
        )
    })

    it('truncates long content to 120 chars in notification body', async () => {
        const db = makeAdminSession()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements')
                return chain({
                    data: { id: 'ann-2', title: 'Long', content: 'x'.repeat(200) },
                    error: null,
                })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        vi.mocked(createAdminClient).mockReturnValue(makeMockDb().client as any)

        await createAnnouncement('Long', 'x'.repeat(200))
        const broadcastArg = vi.mocked(broadcastToAllStudents).mock.calls[0][0]
        expect(broadcastArg.body.length).toBeLessThanOrEqual(120)
        expect(broadcastArg.body).toMatch(/…$/)
    })

    it('throws on DB error', async () => {
        const db = makeAdminSession()
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'announcements')
                return chain({ data: null, error: { message: 'insert failed' } })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(createAnnouncement('T', 'B')).rejects.toThrow('Failed to create announcement')
    })
})

// ─── priorityReserveSlot ──────────────────────────────────────────────────────

describe('priorityReserveSlot', () => {
    beforeEach(() => vi.clearAllMocks())

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    function setupPriorityAdmin(
        bookingInsertResult = { data: { id: 'priority-new' }, error: null }
    ) {
        // verifyAdmin() calls createClient → profiles
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
        // profiles select for verifyAdmin
        db.mockTableOnce('profiles', { data: { role: 'admin' }, error: null })
        // booking insert via session client
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'admin' }, error: null })
            if (table === 'bookings') return chain(bookingInsertResult)
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)
        return db
    }

    it('cancels conflicting student bookings and sends N25 notifications', async () => {
        setupPriorityAdmin()

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [
                {
                    id: 'conflict-1',
                    user_id: 'student-1',
                    players_list: [{ id: 'student-2', status: 'confirmed' }],
                    start_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
                    courts: { name: 'Badminton Court A', sport: 'badminton' },
                },
            ],
            error: null,
        })
        adminDb.mockTableOnce('bookings', { data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await priorityReserveSlot('court-1', futureDate, '10:00', '11:00')

        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({
                    type: 'priority_reserve_cancelled',
                    recipientId: 'student-1',
                }),
                expect.objectContaining({
                    type: 'priority_reserve_cancelled',
                    recipientId: 'student-2',
                }),
            ])
        )
    })

    it('creates priority booking even when no conflicts exist', async () => {
        setupPriorityAdmin({ data: { id: 'priority-2' }, error: null })

        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await priorityReserveSlot('court-1', futureDate, '14:00', '15:00')
        expect(result).toMatchObject({ id: 'priority-2' })
        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })

    it('throws on booking insert error', async () => {
        setupPriorityAdmin({ data: null, error: { message: 'insert failed' } })

        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await expect(priorityReserveSlot('court-1', futureDate, '16:00', '17:00')).rejects.toThrow(
            'Failed to create priority reservation'
        )
    })

    it('does NOT notify pending-status players in conflicting booking', async () => {
        setupPriorityAdmin()

        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [
                {
                    id: 'conflict-2',
                    user_id: 'student-1',
                    players_list: [
                        { id: 'student-2', status: 'confirmed' },
                        { id: 'student-3', status: 'pending' },
                    ],
                    start_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
                    courts: { name: 'Ct', sport: 'badminton' },
                },
            ],
            error: null,
        })
        adminDb.mockTableOnce('bookings', { data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        await priorityReserveSlot('court-1', futureDate, '10:00', '11:00')

        const calls = vi.mocked(sendNotifications).mock.calls[0][0] as any[]
        const recipientIds = calls.map((n: any) => n.recipientId)
        expect(recipientIds).toContain('student-1')
        expect(recipientIds).toContain('student-2')
        expect(recipientIds).not.toContain('student-3')
    })
})

// ─── getDashboardStats ────────────────────────────────────────────────────────

describe('getDashboardStats', () => {
    it('returns stats object with all required keys', async () => {
        const db = makeMockDb()
        const countChain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            then: (resolve: any) => resolve({ count: 5, error: null }),
        }
        db.client.from = vi.fn(() => countChain)
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getDashboardStats()
        expect(result).toHaveProperty('totalEquipment')
        expect(result).toHaveProperty('activeCourts')
        expect(result).toHaveProperty('todayReservations')
        expect(result).toHaveProperty('openComplaints')
    })
})

// ─── verifyAdmin role rejection ───────────────────────────────────────────────

describe('verifyAdmin — role rejection', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeNonAdminDb(role: 'student' | 'manager') {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
        db.mockTable('profiles', { data: { role }, error: null })
        return db
    }

    it('rejects student token when calling removeStudentFromDefaulters', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(removeStudentFromDefaulters('student-1')).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling removeStudentFromDefaulters', async () => {
        const db = makeNonAdminDb('manager')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(removeStudentFromDefaulters('student-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling adjustStudentPoints', async () => {
        const db = makeNonAdminDb('student')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(adjustStudentPoints('student-1', 10)).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling adjustStudentPoints', async () => {
        const db = makeNonAdminDb('manager')
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(adjustStudentPoints('student-1', 10)).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling createAnnouncement', async () => {
        const db = makeNonAdminDb('student')
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'student' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(createAnnouncement('Title', 'Body')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling forceCancelBooking', async () => {
        const db = makeNonAdminDb('student')
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'student' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(forceCancelBooking('b-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling priorityReserveSlot', async () => {
        const db = makeNonAdminDb('student')
        db.client.from = vi.fn((table: string) => {
            if (table === 'profiles') return chain({ data: { role: 'student' }, error: null })
            return chain()
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        await expect(priorityReserveSlot('court-1', futureDate, '10:00', '11:00')).rejects.toThrow(
            'Forbidden'
        )
    })
})
