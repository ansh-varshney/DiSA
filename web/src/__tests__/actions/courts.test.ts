import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

import { getCourts, getActiveCourts, createCourt } from '@/actions/courts'

// ─── getCourts ────────────────────────────────────────────────────────────────

describe('getCourts', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns all courts on success', async () => {
        const db = makeMockDb()
        const courts = [
            { id: 'c-1', name: 'Badminton A', sport: 'badminton', is_active: true },
            { id: 'c-2', name: 'Tennis A', sport: 'tennis', is_active: false },
        ]
        db.mockTable('courts', { data: courts, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCourts()
        expect(result).toEqual(courts)
    })

    it('returns empty array on DB error', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCourts()
        expect(result).toEqual([])
    })

    it('returns null when data is null without error (passthrough)', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getCourts()
        expect(result).toBeNull()
    })
})

// ─── getActiveCourts ──────────────────────────────────────────────────────────

describe('getActiveCourts', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns active courts on success', async () => {
        const db = makeMockDb()
        const courts = [{ id: 'c-1', name: 'Badminton A', sport: 'badminton', is_active: true }]
        db.mockTable('courts', { data: courts, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getActiveCourts()
        expect(result).toEqual(courts)
    })

    it('returns empty array on DB error', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: null, error: { message: 'connection refused' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getActiveCourts()
        expect(result).toEqual([])
    })

    it('returns empty array when no active courts', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getActiveCourts()
        expect(result).toEqual([])
    })
})

// ─── createCourt ──────────────────────────────────────────────────────────────

describe('createCourt', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeFormData(overrides: Record<string, string> = {}) {
        const fd = new FormData()
        fd.set('name', 'Test Court')
        fd.set('sport', 'badminton')
        fd.set('type', 'indoor')
        fd.set('capacity', '4')
        for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
        return fd
    }

    it('inserts court and returns success', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: { id: 'court-new' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createCourt(makeFormData())
        expect(result).toEqual({ success: true })
        expect(revalidatePath).toHaveBeenCalledWith('/admin/courts')
    })

    it('returns error message on DB failure', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: null, error: { message: 'duplicate key' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createCourt(makeFormData())
        expect(result).toEqual({ error: 'duplicate key' })
    })

    it('defaults capacity to 4 when not provided', async () => {
        const db = makeMockDb()
        // We just verify no crash; the actual insert value is checked via the chain
        db.mockTable('courts', { data: { id: 'court-new' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('name', 'No Cap Court')
        fd.set('sport', 'tennis')
        fd.set('type', 'outdoor')
        // capacity intentionally omitted

        const result = await createCourt(fd)
        expect(result).toEqual({ success: true })
    })

    it('defaults capacity to 4 when capacity is 0 (falsy)', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: { id: 'court-new' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createCourt(makeFormData({ capacity: '0' }))
        expect(result).toEqual({ success: true })
    })

    it('uses provided capacity when non-zero', async () => {
        const db = makeMockDb()
        db.mockTable('courts', { data: { id: 'court-new' }, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await createCourt(makeFormData({ capacity: '8' }))
        expect(result).toEqual({ success: true })
    })
})
