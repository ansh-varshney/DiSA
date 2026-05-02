import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { getCurrentUser } from '@/lib/session'
import { revalidatePath } from 'next/cache'
import { updateStudentProfile } from '@/actions/profile'

function makeFormData(overrides: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('branch', 'CSE')
    fd.set('year', '2')
    fd.set('gender', 'Male')
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
    return fd
}

describe('updateStudentProfile', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns success when all fields are provided', async () => {
        mockDrizzleDb.enqueueEmpty() // db.update().set().where()
        expect(await updateStudentProfile(makeFormData())).toEqual({ success: true })
    })

    it('revalidates student layout and profile paths on success', async () => {
        mockDrizzleDb.enqueueEmpty()
        await updateStudentProfile(makeFormData())
        expect(revalidatePath).toHaveBeenCalledWith('/student', 'layout')
        expect(revalidatePath).toHaveBeenCalledWith('/student/profile')
    })

    it('returns error when user is not authenticated', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
        expect(await updateStudentProfile(makeFormData())).toEqual({ error: 'Not authenticated' })
    })

    it('returns error when branch is missing', async () => {
        const fd = new FormData()
        fd.set('year', '2')
        fd.set('gender', 'Male')
        expect(await updateStudentProfile(fd)).toEqual({
            error: 'Branch, year, and gender are required',
        })
    })

    it('returns error when year is missing', async () => {
        const fd = new FormData()
        fd.set('branch', 'CSE')
        fd.set('gender', 'Female')
        expect(await updateStudentProfile(fd)).toEqual({
            error: 'Branch, year, and gender are required',
        })
    })

    it('returns error when gender is missing', async () => {
        const fd = new FormData()
        fd.set('branch', 'ECE')
        fd.set('year', '3')
        expect(await updateStudentProfile(fd)).toEqual({
            error: 'Branch, year, and gender are required',
        })
    })

    it('returns error when fields are whitespace-only', async () => {
        expect(
            await updateStudentProfile(makeFormData({ branch: '   ', year: '  ', gender: '  ' }))
        ).toEqual({ error: 'Branch, year, and gender are required' })
    })

    it('trims whitespace from branch, year, and gender', async () => {
        mockDrizzleDb.enqueueEmpty()
        expect(
            await updateStudentProfile(
                makeFormData({ branch: '  CSE  ', year: ' 2 ', gender: ' Male ' })
            )
        ).toEqual({ success: true })
    })

    it('returns error message when DB update fails', async () => {
        mockDrizzleDb.enqueueThrow('row not found')
        expect(await updateStudentProfile(makeFormData())).toEqual({ error: 'row not found' })
    })
})
