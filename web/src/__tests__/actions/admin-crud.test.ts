/**
 * Tests for admin actions with previously uncovered branches:
 *   - createEquipment: image upload path (lines 100-111)
 *   - updateEquipment: new image uploads + removed image deletion (lines 133-147)
 *   - deleteEquipment: picture deletion loop (line 181)
 *   - createCourt: image upload path (lines 238-251)
 *   - updateCourt: new uploads + removals (lines 271-283)
 *   - cancelReservation: players_list loop building confirmedIds (lines 514-517)
 *   - getStudentViolationHistory: basic query (lines 1168-1188)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'

vi.mock('@/lib/storage', () => ({
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
}))

vi.mock('@/lib/sports', () => ({
    generateEquipmentId: vi.fn(() => '#BAD001'),
    generateCourtId: vi.fn(() => 'BAD-1'),
}))

vi.mock('@/actions/notifications', () => ({
    sendNotification: vi.fn().mockResolvedValue('n-1'),
    sendNotifications: vi.fn().mockResolvedValue(undefined),
    notifyManagers: vi.fn().mockResolvedValue(undefined),
    notifyAdmins: vi.fn().mockResolvedValue(undefined),
    notifyAdminsAndManagers: vi.fn().mockResolvedValue(undefined),
    broadcastToAllStudents: vi.fn().mockResolvedValue(undefined),
}))

import { uploadFile, deleteFile } from '@/lib/storage'
import {
    createEquipment,
    updateEquipment,
    deleteEquipment,
    createCourt,
    updateCourt,
    cancelReservation,
    getStudentViolationHistory,
} from '@/actions/admin'

function makeImageFile(name = 'photo.jpg'): File {
    return new File(['img-data'], name, { type: 'image/jpeg' })
}

// Helper: enqueue an admin profile row so verifyAdmin() passes
function enqueueAdminRole() {
    mockDrizzleDb.enqueue([{ role: 'admin' }])
}

// ─── createEquipment — image upload path ──────────────────────────────────────

describe('createEquipment — image upload', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(uploadFile).mockResolvedValue(
            '/uploads/equipment-images/badminton/eq-1/123-photo.jpg'
        )
    })

    it('uploads images and updates equipment pictures when imageFiles are provided', async () => {
        enqueueAdminRole() // verifyAdmin
        mockDrizzleDb.enqueue([{ equipCount: 0 }]) // count query
        mockDrizzleDb.enqueue([{ id: 'eq-1', name: 'Racket', sport: 'badminton' }]) // insert returning
        mockDrizzleDb.enqueueEmpty() // update pictures

        const fd = new FormData()
        fd.set('name', 'Racket')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        fd.append('images', makeImageFile('photo.jpg'))

        await createEquipment(fd)

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(
            expect.any(File),
            expect.stringContaining('equipment-images/badminton/eq-1')
        )
        expect(mockDrizzleDb.update).toHaveBeenCalled()
    })

    it('skips the pictures update when uploadFile returns null for all files', async () => {
        vi.mocked(uploadFile).mockResolvedValue(null)

        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ equipCount: 1 }]) // count query
        mockDrizzleDb.enqueue([{ id: 'eq-2', name: 'Shuttle', sport: 'badminton' }])

        const fd = new FormData()
        fd.set('name', 'Shuttle')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        fd.append('images', makeImageFile())

        await createEquipment(fd)

        expect(vi.mocked(uploadFile)).toHaveBeenCalled()
        // update should NOT have been called (no urls to save)
        expect(mockDrizzleDb.update).not.toHaveBeenCalled()
    })

    it('does not call uploadFile when no image files are provided', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ equipCount: 2 }]) // count query
        mockDrizzleDb.enqueue([{ id: 'eq-3', name: 'Net', sport: 'tennis' }])

        const fd = new FormData()
        fd.set('name', 'Net')
        fd.set('sport', 'tennis')
        fd.set('condition', 'good')
        // no 'images' field

        await createEquipment(fd)

        expect(vi.mocked(uploadFile)).not.toHaveBeenCalled()
    })
})

// ─── updateEquipment — new uploads + removed image deletion ───────────────────

describe('updateEquipment — image management', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(uploadFile).mockResolvedValue('/uploads/equipment-images/badminton/eq-1/new.jpg')
        vi.mocked(deleteFile).mockResolvedValue(undefined)
    })

    it('uploads new images and appends their URLs', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [], sport: 'badminton' }]) // existing
        mockDrizzleDb.enqueue([{ id: 'eq-1', name: 'Racket' }]) // update returning

        const fd = new FormData()
        fd.set('name', 'Racket')
        fd.set('sport', 'badminton')
        fd.set('condition', 'good')
        fd.set('existingImages', '[]')
        fd.append('images', makeImageFile('new.jpg'))

        await updateEquipment('eq-1', fd)

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(
            expect.any(File),
            expect.stringContaining('equipment-images/badminton/eq-1')
        )
    })

    it('calls deleteFile for images removed from the equipment', async () => {
        enqueueAdminRole()
        // existing has one picture that is NOT in existingImages (i.e., it was removed)
        mockDrizzleDb.enqueue([{ pictures: ['/uploads/old.jpg'], sport: 'tennis' }])
        mockDrizzleDb.enqueue([{ id: 'eq-2', name: 'Net' }])

        const fd = new FormData()
        fd.set('name', 'Net')
        fd.set('sport', 'tennis')
        fd.set('condition', 'good')
        fd.set('existingImages', '[]') // user removed /uploads/old.jpg

        await updateEquipment('eq-2', fd)

        expect(vi.mocked(deleteFile)).toHaveBeenCalledWith('/uploads/old.jpg')
    })

    it('does not call deleteFile when no images were removed', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: ['/uploads/kept.jpg'], sport: 'tennis' }])
        mockDrizzleDb.enqueue([{ id: 'eq-3', name: 'Racket' }])

        const fd = new FormData()
        fd.set('name', 'Racket')
        fd.set('sport', 'tennis')
        fd.set('condition', 'good')
        fd.set('existingImages', JSON.stringify(['/uploads/kept.jpg']))

        await updateEquipment('eq-3', fd)

        expect(vi.mocked(deleteFile)).not.toHaveBeenCalled()
    })
})

// ─── deleteEquipment — picture deletion loop ──────────────────────────────────

describe('deleteEquipment — picture cleanup', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(deleteFile).mockResolvedValue(undefined)
    })

    it('calls deleteFile for each picture URL when equipment has pictures', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: ['/uploads/a.jpg', '/uploads/b.jpg'] }]) // select
        mockDrizzleDb.enqueueEmpty() // update condition=retired

        await deleteEquipment('eq-1')

        expect(vi.mocked(deleteFile)).toHaveBeenCalledTimes(2)
        expect(vi.mocked(deleteFile)).toHaveBeenCalledWith('/uploads/a.jpg')
        expect(vi.mocked(deleteFile)).toHaveBeenCalledWith('/uploads/b.jpg')
    })

    it('does not call deleteFile when equipment has no pictures', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [] }])
        mockDrizzleDb.enqueueEmpty()

        await deleteEquipment('eq-2')

        expect(vi.mocked(deleteFile)).not.toHaveBeenCalled()
    })
})

// ─── createCourt — image upload path ─────────────────────────────────────────

describe('createCourt — image upload', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(uploadFile).mockResolvedValue('/uploads/court-images/badminton/c-1/photo.jpg')
    })

    it('uploads images and updates court pictures', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ courtCount: 0 }]) // count query
        mockDrizzleDb.enqueue([{ id: 'c-1', name: 'Badminton A', sport: 'badminton' }]) // insert
        mockDrizzleDb.enqueueEmpty() // update pictures

        const fd = new FormData()
        fd.set('name', 'Badminton A')
        fd.set('sport', 'badminton')
        fd.append('images', makeImageFile())

        await createCourt(fd)

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(
            expect.any(File),
            expect.stringContaining('court-images/badminton/c-1')
        )
        expect(mockDrizzleDb.update).toHaveBeenCalled()
    })

    it('skips pictures update when all uploads fail', async () => {
        vi.mocked(uploadFile).mockResolvedValue(null)

        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ courtCount: 1 }])
        mockDrizzleDb.enqueue([{ id: 'c-2', name: 'Badminton B', sport: 'badminton' }])

        const fd = new FormData()
        fd.set('name', 'Badminton B')
        fd.set('sport', 'badminton')
        fd.append('images', makeImageFile())

        await createCourt(fd)

        expect(vi.mocked(uploadFile)).toHaveBeenCalled()
        expect(mockDrizzleDb.update).not.toHaveBeenCalled()
    })
})

// ─── updateCourt — new uploads + removed image deletion ───────────────────────

describe('updateCourt — image management', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(uploadFile).mockResolvedValue('/uploads/court-images/tennis/c-1/new.jpg')
        vi.mocked(deleteFile).mockResolvedValue(undefined)
    })

    it('uploads new images for the court', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: [], sport: 'tennis' }])
        mockDrizzleDb.enqueue([{ id: 'c-1', name: 'Tennis A' }])

        const fd = new FormData()
        fd.set('name', 'Tennis A')
        fd.set('condition', 'good')
        fd.set('existingImages', '[]')
        fd.append('images', makeImageFile('new.jpg'))

        await updateCourt('c-1', fd)

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(
            expect.any(File),
            expect.stringContaining('court-images/tennis/c-1')
        )
    })

    it('calls deleteFile for removed court pictures', async () => {
        enqueueAdminRole()
        mockDrizzleDb.enqueue([{ pictures: ['/uploads/old-court.jpg'], sport: 'badminton' }])
        mockDrizzleDb.enqueue([{ id: 'c-2', name: 'Badminton A' }])

        const fd = new FormData()
        fd.set('name', 'Badminton A')
        fd.set('condition', 'good')
        fd.set('existingImages', '[]') // removed the picture

        await updateCourt('c-2', fd)

        expect(vi.mocked(deleteFile)).toHaveBeenCalledWith('/uploads/old-court.jpg')
    })
})

// ─── cancelReservation — players_list loop ────────────────────────────────────

describe('cancelReservation — players_list notifications', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('notifies the booker and confirmed players when players_list is non-empty', async () => {
        const { sendNotifications } = await import('@/actions/notifications')

        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                players_list: [
                    { id: 'player-1', status: 'confirmed' },
                    { id: 'player-2', status: 'pending_confirmation' }, // not confirmed — should NOT be included
                ],
                start_time: new Date(Date.now() + 3_600_000),
                is_priority: false,
                is_maintenance: false,
                courts: { name: 'Badminton A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty() // update status=cancelled

        await cancelReservation('b-1')

        expect(vi.mocked(sendNotifications)).toHaveBeenCalled()
        const callArg = vi.mocked(sendNotifications).mock.calls[0][0]
        const recipientIds = callArg.map((n: any) => n.recipientId)
        expect(recipientIds).toContain('booker-1')
        expect(recipientIds).toContain('player-1')
        // pending_confirmation player should NOT be notified
        expect(recipientIds).not.toContain('player-2')
    })

    it('does not send notifications for priority bookings', async () => {
        const { sendNotifications } = await import('@/actions/notifications')
        vi.mocked(sendNotifications).mockClear()

        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                players_list: [],
                start_time: new Date(Date.now() + 3_600_000),
                is_priority: true, // priority — skip notifications
                is_maintenance: false,
                courts: { name: 'Badminton A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty()

        await cancelReservation('b-priority')

        expect(vi.mocked(sendNotifications)).not.toHaveBeenCalled()
    })

    it('handles string player entries in players_list (always treated as confirmed)', async () => {
        const { sendNotifications } = await import('@/actions/notifications')
        vi.mocked(sendNotifications).mockClear()

        enqueueAdminRole()
        mockDrizzleDb.enqueue([
            {
                user_id: 'booker-1',
                players_list: ['string-player-id'], // string format — no status, treated as confirmed
                start_time: new Date(Date.now() + 3_600_000),
                is_priority: false,
                is_maintenance: false,
                courts: { name: 'Squash A' },
            },
        ])
        mockDrizzleDb.enqueueEmpty()

        await cancelReservation('b-2')

        const callArg = vi.mocked(sendNotifications).mock.calls[0][0]
        const recipientIds = callArg.map((n: any) => n.recipientId)
        expect(recipientIds).toContain('string-player-id')
    })
})

// ─── getStudentViolationHistory ───────────────────────────────────────────────

describe('getStudentViolationHistory', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('returns empty array when the student has no violations', async () => {
        mockDrizzleDb.enqueue([])

        const result = await getStudentViolationHistory('s-1')

        expect(result).toEqual([])
    })

    it('returns violation rows for the given student', async () => {
        const violationRow = {
            id: 'v-1',
            student_id: 's-1',
            violation_type: 'late_arrival',
            severity: 'minor',
            reason: 'Arrived 15 minutes late',
            reported_by: null,
            points_deducted: -5,
            booking_id: 'b-1',
            created_at: new Date(),
            reported_by_profile: { full_name: null },
        }
        mockDrizzleDb.enqueue([violationRow])

        const result = await getStudentViolationHistory('s-1')

        expect(result).toHaveLength(1)
        expect((result[0] as any).violation_type).toBe('late_arrival')
    })

    it('returns multiple violations ordered by newest first', async () => {
        const rows = [
            { id: 'v-2', student_id: 's-1', violation_type: 'no_show', created_at: new Date() },
            {
                id: 'v-1',
                student_id: 's-1',
                violation_type: 'late_arrival',
                created_at: new Date(Date.now() - 86_400_000),
            },
        ]
        mockDrizzleDb.enqueue(rows)

        const result = await getStudentViolationHistory('s-1')

        expect(result).toHaveLength(2)
        expect((result[0] as any).id).toBe('v-2') // newest first per orderBy
    })
})
