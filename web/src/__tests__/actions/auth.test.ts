import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/auth so next-auth is never imported in the test environment
vi.mock('@/auth', () => ({
    signOut: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn().mockResolvedValue(undefined),
    auth: vi.fn().mockResolvedValue(null),
    handlers: { GET: vi.fn(), POST: vi.fn() },
}))

import { signOut as nextAuthSignOut } from '@/auth'
import { signOut } from '@/actions/auth'

describe('signOut action', () => {
    beforeEach(() => vi.clearAllMocks())

    it('delegates to NextAuth signOut with /login redirect', async () => {
        await signOut()
        expect(nextAuthSignOut).toHaveBeenCalledWith({ redirectTo: '/login' })
    })
})
