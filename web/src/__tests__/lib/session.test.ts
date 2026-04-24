/**
 * Direct tests for lib/session.ts → getCurrentUser()
 *
 * vitest.setup.ts mocks @/lib/session globally, so we must explicitly unmock it
 * here to test the real implementation. @/auth is mocked so NextAuth isn't invoked.
 */

// Unmock the module under test so the real implementation is loaded.
vi.unmock('@/lib/session')

// Mock the only dependency — auth() from NextAuth.
vi.mock('@/auth', () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { auth } from '@/auth'
import { getCurrentUser } from '@/lib/session'

describe('getCurrentUser', () => {
    beforeEach(() => {
        vi.mocked(auth).mockReset()
    })

    it('returns null when auth() returns null (no active session)', async () => {
        vi.mocked(auth).mockResolvedValue(null)

        const result = await getCurrentUser()

        expect(result).toBeNull()
    })

    it('returns null when session exists but user has no id', async () => {
        vi.mocked(auth).mockResolvedValue({ user: {}, expires: '9999' } as any)

        const result = await getCurrentUser()

        expect(result).toBeNull()
    })

    it('returns { id, email } for a valid session', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u-123', email: 'alice@iiitd.ac.in' },
            expires: '9999',
        } as any)

        const result = await getCurrentUser()

        expect(result).toEqual({ id: 'u-123', email: 'alice@iiitd.ac.in' })
    })

    it('returns undefined email when session has no email field', async () => {
        vi.mocked(auth).mockResolvedValue({
            user: { id: 'u-456' },
            expires: '9999',
        } as any)

        const result = await getCurrentUser()

        expect(result).toEqual({ id: 'u-456', email: undefined })
    })

    it('calls auth() exactly once per invocation', async () => {
        vi.mocked(auth).mockResolvedValue(null)

        await getCurrentUser()

        expect(vi.mocked(auth)).toHaveBeenCalledTimes(1)
    })
})
