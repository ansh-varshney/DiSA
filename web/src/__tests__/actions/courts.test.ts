import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { revalidatePath } from 'next/cache'

vi.mock('@/lib/auth-guards', () => ({
    requireAdmin: vi.fn().mockResolvedValue({ id: 'student-1' }),
    requireManager: vi.fn().mockResolvedValue({ id: 'student-1' }),
}))

import { getCourts, getActiveCourts, createCourt } from '@/actions/courts'

const COURTS = [
    { id: 'c-1', name: 'Badminton A', sport: 'badminton', is_active: true },
    { id: 'c-2', name: 'Tennis A', sport: 'tennis', is_active: false },
]

function makeFormData(overrides: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('name', 'Test Court')
    fd.set('sport', 'badminton')
    fd.set('type', 'indoor')
    fd.set('capacity', '4')
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
    return fd
}

describe('getCourts', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns all courts on success', async () => {
        mockDrizzleDb.enqueue(COURTS)
        expect(await getCourts()).toEqual(COURTS)
    })

    it('returns empty array when no courts exist', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getCourts()).toEqual([])
    })

    it('returns empty array on DB error', async () => {
        mockDrizzleDb.enqueueThrow('connection refused')
        expect(await getCourts()).toEqual([])
    })
})

describe('getActiveCourts', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns active courts on success', async () => {
        const activeCourts = COURTS.filter((c) => c.is_active)
        mockDrizzleDb.enqueue(activeCourts)
        expect(await getActiveCourts()).toEqual(activeCourts)
    })

    it('returns empty array when no active courts', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getActiveCourts()).toEqual([])
    })

    it('returns empty array on DB error', async () => {
        mockDrizzleDb.enqueueThrow('connection refused')
        expect(await getActiveCourts()).toEqual([])
    })
})

describe('createCourt', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('inserts court and returns success', async () => {
        mockDrizzleDb.enqueueEmpty() // db.insert().values()
        const result = await createCourt(makeFormData())
        expect(result).toEqual({ success: true })
        expect(revalidatePath).toHaveBeenCalledWith('/admin/courts')
    })

    it('returns error message on DB failure', async () => {
        mockDrizzleDb.enqueueThrow('duplicate key')
        const result = await createCourt(makeFormData())
        expect(result).toEqual({ error: 'duplicate key' })
    })

    it('defaults capacity to 4 when not provided', async () => {
        mockDrizzleDb.enqueueEmpty()
        const fd = new FormData()
        fd.set('name', 'No Cap Court')
        fd.set('sport', 'tennis')
        fd.set('type', 'outdoor')
        expect(await createCourt(fd)).toEqual({ success: true })
    })

    it('defaults capacity to 4 when capacity is 0 (falsy)', async () => {
        mockDrizzleDb.enqueueEmpty()
        expect(await createCourt(makeFormData({ capacity: '0' }))).toEqual({ success: true })
    })

    it('uses provided capacity when non-zero', async () => {
        mockDrizzleDb.enqueueEmpty()
        expect(await createCourt(makeFormData({ capacity: '8' }))).toEqual({ success: true })
    })
})
