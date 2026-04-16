import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb, FIXTURES } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

import { updateStudentProfile } from '@/actions/profile'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(overrides: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('branch', 'CSE')
    fd.set('year', '2')
    fd.set('gender', 'Male')
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
    return fd
}

function makeAuthenticatedDb() {
    const db = makeMockDb()
    db.auth.getUser.mockResolvedValue({ data: { user: FIXTURES.user } })
    return db
}

// ─── updateStudentProfile ─────────────────────────────────────────────────────

describe('updateStudentProfile', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns success when all fields are provided', async () => {
        const db = makeAuthenticatedDb()
        db.mockTable('profiles', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateStudentProfile(makeFormData())
        expect(result).toEqual({ success: true })
    })

    it('revalidates student layout and profile paths on success', async () => {
        const db = makeAuthenticatedDb()
        db.mockTable('profiles', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await updateStudentProfile(makeFormData())

        expect(revalidatePath).toHaveBeenCalledWith('/student', 'layout')
        expect(revalidatePath).toHaveBeenCalledWith('/student/profile')
    })

    it('returns error when user is not authenticated', async () => {
        const db = makeMockDb()
        db.auth.getUser.mockResolvedValue({ data: { user: null } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateStudentProfile(makeFormData())
        expect(result).toEqual({ error: 'Not authenticated' })
    })

    it('returns error when branch is missing', async () => {
        const db = makeAuthenticatedDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('year', '2')
        fd.set('gender', 'Male')

        const result = await updateStudentProfile(fd)
        expect(result).toEqual({ error: 'Branch, year, and gender are required' })
    })

    it('returns error when year is missing', async () => {
        const db = makeAuthenticatedDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('branch', 'CSE')
        fd.set('gender', 'Female')

        const result = await updateStudentProfile(fd)
        expect(result).toEqual({ error: 'Branch, year, and gender are required' })
    })

    it('returns error when gender is missing', async () => {
        const db = makeAuthenticatedDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const fd = new FormData()
        fd.set('branch', 'ECE')
        fd.set('year', '3')

        const result = await updateStudentProfile(fd)
        expect(result).toEqual({ error: 'Branch, year, and gender are required' })
    })

    it('returns error when fields are whitespace-only', async () => {
        const db = makeAuthenticatedDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateStudentProfile(
            makeFormData({ branch: '   ', year: '  ', gender: '  ' })
        )
        expect(result).toEqual({ error: 'Branch, year, and gender are required' })
    })

    it('trims whitespace from branch, year, and gender', async () => {
        const db = makeAuthenticatedDb()
        db.mockTable('profiles', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateStudentProfile(
            makeFormData({ branch: '  CSE  ', year: ' 2 ', gender: ' Male ' })
        )
        expect(result).toEqual({ success: true })
    })

    it('returns error message when DB update fails', async () => {
        const db = makeAuthenticatedDb()
        db.mockTable('profiles', { data: null, error: { message: 'row not found' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await updateStudentProfile(makeFormData())
        expect(result).toEqual({ error: 'row not found' })
    })
})
