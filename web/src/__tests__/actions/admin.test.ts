import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { getCurrentUser } from '@/lib/session'

vi.mock('@/lib/sports', () => ({
    generateCourtId: vi.fn(() => 'CRT-001'),
    generateEquipmentId: vi.fn(() => 'EQ-001'),
}))
vi.mock('@/lib/storage', () => ({
    uploadFile: vi.fn().mockResolvedValue(null),
    deleteFile: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('notif-new'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
}))

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

function enqueueAdminRole() {
    mockDrizzleDb.enqueue([{ role: 'admin' }])
}

function enqueueForbiddenRole(role = 'student') {
    mockDrizzleDb.enqueue([{ role }])
}

// ─── getDefaulterStudents ─────────────────────────────────────────────────────

describe('getDefaulterStudents', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns empty array when no violations', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([]) // select from student_violations
        expect(await getDefaulterStudents()).toEqual([])
    })

    it('groups multiple violations for the same student', async () => {
        enqueueAdminRole()
        const now = new Date()
        mockDrizzleDb.enqueue([
            {
                id: 'v1',
                student_id: 'student-1',
                violation_type: 'students_late',
                severity: 'minor',
                reason: 'came late',
                reported_by: null,
                created_at: now,
                profile_full_name: 'Alice',
                profile_student_id: 'MT23001',
                profile_email: 'alice@iiitd.ac.in',
                profile_phone_number: '9876543210',
                profile_banned_until: null,
            },
            {
                id: 'v2',
                student_id: 'student-1',
                violation_type: 'improper_gear',
                severity: 'minor',
                reason: 'no shoes',
                reported_by: null,
                created_at: now,
                profile_full_name: 'Alice',
                profile_student_id: 'MT23001',
                profile_email: 'alice@iiitd.ac.in',
                profile_phone_number: '9876543210',
                profile_banned_until: null,
            },
        ])

        const result = await getDefaulterStudents()
        expect(result).toHaveLength(1)
        expect(result[0].total_violations).toBe(2)
    })

    it('correctly counts late_arrival_count and exposes banned_until', async () => {
        enqueueAdminRole()
        const now = new Date()
        const bannedUntil = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        const makeRow = (type: string) => ({
            id: Math.random().toString(),
            student_id: 'student-1',
            violation_type: type,
            severity: 'minor',
            reason: 'came late',
            reported_by: null,
            created_at: now,
            profile_full_name: 'Bob',
            profile_student_id: 'MT23002',
            profile_email: 'bob@iiitd.ac.in',
            profile_phone_number: null,
            profile_banned_until: bannedUntil,
        })

        mockDrizzleDb.enqueue([
            makeRow('students_late'),
            makeRow('students_late'),
            makeRow('students_late'),
        ])

        const result = await getDefaulterStudents()
        expect(result[0].late_arrival_count).toBe(3)
        expect(result[0].banned_until).toBeTruthy()
        expect(new Date(result[0].banned_until!).getTime()).toBeGreaterThan(Date.now())
    })
})

// ─── removeStudentFromDefaulters ──────────────────────────────────────────────

describe('removeStudentFromDefaulters', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('calls clear_student_defaulter and sends defaulter_cleared notification', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueEmpty() // db.execute (clear_student_defaulter)
        // sendNotification is mocked

        const result = await removeStudentFromDefaulters('student-1')
        expect(result).toEqual({ success: true })
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'student-1', type: 'defaulter_cleared' })
        )
    })

    it('throws when execute fails', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueThrow('RPC failed')
        await expect(removeStudentFromDefaulters('student-1')).rejects.toThrow('RPC failed')
    })
})

// ─── adjustStudentPoints ──────────────────────────────────────────────────────

describe('adjustStudentPoints', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('calls update_student_points execute and sends points_adjusted notification', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueEmpty() // db.execute (update_student_points)

        await adjustStudentPoints('student-1', 15)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ recipientId: 'student-1', type: 'points_adjusted' })
        )
    })

    it('sends N18 with signed delta string for negative adjustment', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueEmpty()

        await adjustStudentPoints('student-1', -10)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ body: expect.stringContaining('-10') })
        )
    })

    it('shows + sign for positive adjustments', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueEmpty()

        await adjustStudentPoints('student-1', 20)
        expect(vi.mocked(sendNotification)).toHaveBeenCalledWith(
            expect.objectContaining({ body: expect.stringContaining('+20') })
        )
    })

    it('throws when execute fails', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueueThrow('RPC error')
        await expect(adjustStudentPoints('student-1', 5)).rejects.toThrow('RPC error')
    })
})

// ─── createAnnouncement ───────────────────────────────────────────────────────

describe('createAnnouncement', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('inserts announcement and broadcasts to all students', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ id: 'ann-1', title: 'Test', content: 'Hello' }]) // insert returning

        const result = await createAnnouncement('Test', 'Hello all students')
        expect(result).toMatchObject({ id: 'ann-1' })
        expect(vi.mocked(broadcastToAllStudents)).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'announcement', title: 'Announcement: Test' })
        )
    })

    it('truncates long content to 120 chars in notification body', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ id: 'ann-2', title: 'Long', content: 'x'.repeat(200) }])

        await createAnnouncement('Long', 'x'.repeat(200))
        const broadcastArg = vi.mocked(broadcastToAllStudents).mock.calls[0][0]
        expect(broadcastArg.body.length).toBeLessThanOrEqual(120)
        expect(broadcastArg.body).toMatch(/…$/)
    })

    it('throws on DB error (empty returning = no row)', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([]) // returning() → empty → data = undefined → throws

        await expect(createAnnouncement('T', 'B')).rejects.toThrow('Failed to create announcement')
    })
})

// ─── priorityReserveSlot ──────────────────────────────────────────────────────

describe('priorityReserveSlot', () => {
    beforeEach(() => mockDrizzleDb.reset())

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    it('cancels conflicting student bookings and sends priority_reserve_cancelled notifications', async () => {
        enqueueAdminRole()
        // conflicting bookings select
        mockDrizzleDb.enqueue([
            {
                id: 'conflict-1',
                user_id: 'student-1',
                players_list: [{ id: 'student-2', status: 'confirmed' }],
                start_time: new Date(Date.now() + 25 * 60 * 60 * 1000),
                courts: { name: 'Badminton Court A', sport: 'badminton' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // update booking (cancel conflict-1)
        // sendNotifications is mocked — no DB call
        // insert priority booking
        mockDrizzleDb.enqueue([{ id: 'priority-new' }])

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
        enqueueAdminRole()
        mockDrizzleDb.enqueue([]) // no conflicting bookings
        mockDrizzleDb.enqueue([{ id: 'priority-2' }]) // insert returning

        const result = await priorityReserveSlot('court-1', futureDate, '14:00', '15:00')
        expect(result).toMatchObject({ id: 'priority-2' })
        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })

    it('throws on booking insert error', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([]) // no conflicts
        mockDrizzleDb.enqueue([]) // insert returning → empty → throws

        await expect(priorityReserveSlot('court-1', futureDate, '16:00', '17:00')).rejects.toThrow(
            'Failed to create priority reservation'
        )
    })

    it('does NOT notify pending-status players in conflicting booking', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                id: 'conflict-2',
                user_id: 'student-1',
                players_list: [
                    { id: 'student-2', status: 'confirmed' },
                    { id: 'student-3', status: 'pending' },
                ],
                start_time: new Date(Date.now() + 25 * 60 * 60 * 1000),
                courts: { name: 'Ct', sport: 'badminton' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // cancel conflict
        mockDrizzleDb.enqueue([{ id: 'priority-3' }])

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
    beforeEach(() => mockDrizzleDb.reset())

    it('returns stats object with all required keys', async () => {
        enqueueAdminRole()
        // Promise.all with 4 concurrent queries — pops in array order
        mockDrizzleDb.enqueue([{ count: 3 }]) // equipment count
        mockDrizzleDb.enqueue([{ count: 2 }]) // courts count
        mockDrizzleDb.enqueue([{ count: 5 }]) // reservations count
        mockDrizzleDb.enqueue([{ count: 1 }]) // complaints count

        const result = await getDashboardStats()
        expect(result).toHaveProperty('totalEquipment')
        expect(result).toHaveProperty('activeCourts')
        expect(result).toHaveProperty('todayReservations')
        expect(result).toHaveProperty('openComplaints')
        expect(result.totalEquipment).toBe(3)
        expect(result.activeCourts).toBe(2)
    })
})

// ─── forceCancelBooking ───────────────────────────────────────────────────────

describe('forceCancelBooking', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('cancels booking and sends force_cancelled notification to all players', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'student-1',
                players_list: [{ id: 'student-2', status: 'confirmed' }],
                start_time: new Date(Date.now() + 3600000),
                is_priority: false,
                is_maintenance: false,
                courts: { name: 'Badminton Court A' },
            },
        ]) // select booking
        mockDrizzleDb.enqueue([{ id: 'b-1', status: 'cancelled' }]) // update returning

        const result = await forceCancelBooking('b-1')
        expect(result).toMatchObject({ id: 'b-1' })
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ type: 'force_cancelled', recipientId: 'student-1' }),
                expect.objectContaining({ type: 'force_cancelled', recipientId: 'student-2' }),
            ])
        )
    })

    it('does not send notifications for priority bookings', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'admin-1',
                players_list: [],
                start_time: new Date(),
                is_priority: true,
                is_maintenance: false,
                courts: { name: 'Ct' },
            },
        ])
        mockDrizzleDb.enqueue([{ id: 'b-p', status: 'cancelled' }])

        await forceCancelBooking('b-p')
        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })

    it('throws when booking update returns empty', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 's-1',
                players_list: [],
                start_time: new Date(),
                is_priority: false,
                is_maintenance: false,
                courts: null,
            },
        ])
        mockDrizzleDb.enqueue([]) // update returning → empty → throws

        await expect(forceCancelBooking('nonexistent')).rejects.toThrow('Failed to cancel booking')
    })
})

// ─── verifyAdmin role rejection ───────────────────────────────────────────────

describe('verifyAdmin — role rejection', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('rejects student token when calling removeStudentFromDefaulters', async () => {
        enqueueForbiddenRole('student')
        await expect(removeStudentFromDefaulters('student-1')).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling removeStudentFromDefaulters', async () => {
        enqueueForbiddenRole('manager')
        await expect(removeStudentFromDefaulters('student-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling adjustStudentPoints', async () => {
        enqueueForbiddenRole('student')
        await expect(adjustStudentPoints('student-1', 10)).rejects.toThrow('Forbidden')
    })

    it('rejects manager token when calling adjustStudentPoints', async () => {
        enqueueForbiddenRole('manager')
        await expect(adjustStudentPoints('student-1', 10)).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling createAnnouncement', async () => {
        enqueueForbiddenRole('student')
        await expect(createAnnouncement('Title', 'Body')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling forceCancelBooking', async () => {
        enqueueForbiddenRole('student')
        await expect(forceCancelBooking('b-1')).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling priorityReserveSlot', async () => {
        enqueueForbiddenRole('student')
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        await expect(priorityReserveSlot('court-1', futureDate, '10:00', '11:00')).rejects.toThrow(
            'Forbidden'
        )
    })

    it('rejects when getCurrentUser returns null', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
        await expect(removeStudentFromDefaulters('s-1')).rejects.toThrow('Unauthorized')
    })

    it('rejects student token when calling getDefaulterStudents', async () => {
        enqueueForbiddenRole('student')
        await expect(getDefaulterStudents()).rejects.toThrow('Forbidden')
    })

    it('rejects student token when calling getDashboardStats', async () => {
        enqueueForbiddenRole('student')
        await expect(getDashboardStats()).rejects.toThrow('Forbidden')
    })
})
