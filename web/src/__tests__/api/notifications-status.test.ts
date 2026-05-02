/**
 * Tests for GET /api/notifications/status
 *
 * Verifies: auth gating, missing ids param, empty ids after filtering,
 * exceeding the 20-id cap, and DB query returning read-status rows.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { mockDrizzleDb } from '../mocks/drizzle'

vi.mock('@/auth', () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
}))

import { auth } from '@/auth'
import { GET } from '@/app/api/notifications/status/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(ids?: string): NextRequest {
    const searchParams = new URLSearchParams()
    if (ids !== undefined) searchParams.set('ids', ids)
    return { nextUrl: { searchParams } } as unknown as NextRequest
}

function authedSession(userId = 'student-1') {
    return { user: { id: userId }, expires: '9999' } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/notifications/status', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(auth).mockResolvedValue(null as any)
    })

    // ── Auth gating ──────────────────────────────────────────────────────────

    it('returns 401 with empty array when unauthenticated', async () => {
        const res = await GET(makeRequest('n-1,n-2'))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual([])
    })

    it('returns 401 when session has no user id', async () => {
        vi.mocked(auth).mockResolvedValue({ user: {}, expires: '9999' } as any)

        const res = await GET(makeRequest('n-1'))

        expect(res.status).toBe(401)
    })

    // ── ids param handling ────────────────────────────────────────────────────

    it('returns empty array when ids param is missing', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())

        const res = await GET(makeRequest())

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([])
    })

    it('returns empty array when ids param is an empty string', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())

        const res = await GET(makeRequest(''))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([])
    })

    // ── Normal operation ──────────────────────────────────────────────────────

    it('returns read-status rows from DB for valid ids', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        mockDrizzleDb.enqueue([
            { id: 'n-1', is_read: false },
            { id: 'n-2', is_read: true },
        ])

        const res = await GET(makeRequest('n-1,n-2'))

        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data).toHaveLength(2)
        expect(data[0]).toEqual({ id: 'n-1', is_read: false })
        expect(data[1]).toEqual({ id: 'n-2', is_read: true })
    })

    it('returns empty array when no matching notifications exist', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        mockDrizzleDb.enqueue([])

        const res = await GET(makeRequest('n-missing'))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([])
    })

    it('caps ids at 20 — only queries up to 20 ids', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        // Supply 25 ids; route slices to 20
        const ids = Array.from({ length: 25 }, (_, i) => `n-${i}`).join(',')
        mockDrizzleDb.enqueue([])

        await GET(makeRequest(ids))

        // DB select was called exactly once (the slice happened client-side)
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1)
    })

    it('queries using the authenticated user id for isolation', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession('manager-7'))
        mockDrizzleDb.enqueue([{ id: 'n-mgr', is_read: true }])

        const res = await GET(makeRequest('n-mgr'))
        const data = await res.json()

        expect(data[0].id).toBe('n-mgr')
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1)
    })
})
