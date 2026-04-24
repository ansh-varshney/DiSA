/**
 * Direct tests for lib/auth-guards.ts
 *
 * requireAdmin() and requireManager() are mocked in every other test file,
 * so they never appear in coverage. This file tests the real implementations.
 *
 * Dependencies:
 *   - @/lib/session  → globally mocked in vitest.setup.ts (returns { id: 'student-1' })
 *   - @/db           → globally mocked in vitest.setup.ts (mockDrizzleDb)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'
import { getCurrentUser } from '@/lib/session'
import { requireAdmin, requireManager } from '@/lib/auth-guards'

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe('requireAdmin', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('throws Unauthorized when no user is logged in', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
        await expect(requireAdmin()).rejects.toThrow('Unauthorized')
    })

    it('throws Forbidden when profile is not found in the DB', async () => {
        mockDrizzleDb.enqueue([]) // empty result → no profile row
        await expect(requireAdmin()).rejects.toThrow('Forbidden')
    })

    it('throws Forbidden when user role is student', async () => {
        mockDrizzleDb.enqueue([{ role: 'student' }])
        await expect(requireAdmin()).rejects.toThrow('Forbidden')
    })

    it('throws Forbidden when user role is manager', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        await expect(requireAdmin()).rejects.toThrow('Forbidden')
    })

    it('returns { id } when user role is admin', async () => {
        mockDrizzleDb.enqueue([{ role: 'admin' }])
        const result = await requireAdmin()
        expect(result).toEqual({ id: 'student-1' })
    })

    it('returns { id } when user role is superuser', async () => {
        mockDrizzleDb.enqueue([{ role: 'superuser' }])
        const result = await requireAdmin()
        expect(result).toEqual({ id: 'student-1' })
    })

    it('uses the authenticated user id — not a hardcoded value', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'admin-99', email: 'admin@iiitd.ac.in' })
        mockDrizzleDb.enqueue([{ role: 'admin' }])
        const result = await requireAdmin()
        expect(result.id).toBe('admin-99')
    })
})

// ─── requireManager ───────────────────────────────────────────────────────────

describe('requireManager', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
    })

    it('throws Unauthorized when no user is logged in', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce(null)
        await expect(requireManager()).rejects.toThrow('Unauthorized')
    })

    it('throws Forbidden when profile is not found in the DB', async () => {
        mockDrizzleDb.enqueue([])
        await expect(requireManager()).rejects.toThrow('Forbidden')
    })

    it('throws Forbidden when user role is student', async () => {
        mockDrizzleDb.enqueue([{ role: 'student' }])
        await expect(requireManager()).rejects.toThrow('Forbidden')
    })

    it('returns { id } when user role is manager', async () => {
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        const result = await requireManager()
        expect(result).toEqual({ id: 'student-1' })
    })

    it('returns { id } when user role is admin (admin has manager access)', async () => {
        mockDrizzleDb.enqueue([{ role: 'admin' }])
        const result = await requireManager()
        expect(result).toEqual({ id: 'student-1' })
    })

    it('returns { id } when user role is superuser', async () => {
        mockDrizzleDb.enqueue([{ role: 'superuser' }])
        const result = await requireManager()
        expect(result).toEqual({ id: 'student-1' })
    })

    it('uses the authenticated user id — not a hardcoded value', async () => {
        vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: 'mgr-42', email: 'mgr@iiitd.ac.in' })
        mockDrizzleDb.enqueue([{ role: 'manager' }])
        const result = await requireManager()
        expect(result.id).toBe('mgr-42')
    })

    it('throws Forbidden when profile role is null (covers role ?? "" branch)', async () => {
        mockDrizzleDb.enqueue([{ role: null }])
        await expect(requireManager()).rejects.toThrow('Forbidden')
    })
})
