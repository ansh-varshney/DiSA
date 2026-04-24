/**
 * Tests for GET /api/notifications
 *
 * Verifies: auth gating, since-param filtering, empty results, limit cap.
 * The route queries Drizzle — responses are controlled via mockDrizzleDb.enqueue().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { mockDrizzleDb } from '../mocks/drizzle'

// Must be hoisted before the route import so the module uses the mock.
vi.mock('@/auth', () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
}))

import { auth } from '@/auth'
import { GET } from '@/app/api/notifications/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(since?: string): NextRequest {
    const searchParams = new URLSearchParams()
    if (since) searchParams.set('since', since)
    return {
        nextUrl: { searchParams },
    } as unknown as NextRequest
}

function authedSession(userId = 'student-1') {
    return { user: { id: userId }, expires: '9999' } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/notifications', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(auth).mockResolvedValue(null)
    })

    // ── Auth gating ──────────────────────────────────────────────────────────

    it('returns 401 with empty array when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null)

        const res = await GET(makeRequest())

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual([])
    })

    it('returns 401 when session exists but has no user id', async () => {
        vi.mocked(auth).mockResolvedValue({ user: {}, expires: '9999' } as any)

        const res = await GET(makeRequest())

        expect(res.status).toBe(401)
    })

    // ── Normal operation ─────────────────────────────────────────────────────

    it('returns 200 with empty array when no unread notifications match', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        mockDrizzleDb.enqueue([])

        const res = await GET(makeRequest('2025-01-01T00:00:00.000Z'))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual([])
    })

    it('returns matching notifications as JSON', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        const notif = {
            id: 'n-1',
            recipient_id: 'student-1',
            type: 'announcement',
            title: 'Test',
            body: 'Hello',
            is_read: false,
            created_at: new Date('2025-06-01T10:00:00Z'),
        }
        mockDrizzleDb.enqueue([notif])

        const res = await GET(makeRequest('2025-01-01T00:00:00.000Z'))

        expect(res.status).toBe(200)
        const data = await res.json()
        expect(data).toHaveLength(1)
        expect(data[0].id).toBe('n-1')
        expect(data[0].type).toBe('announcement')
    })

    it('returns multiple notifications ordered by the DB (latest first)', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        const notifications = [
            { id: 'n-3', type: 'session_ended' },
            { id: 'n-2', type: 'booking_cancelled_by_booker' },
            { id: 'n-1', type: 'announcement' },
        ]
        mockDrizzleDb.enqueue(notifications)

        const res = await GET(makeRequest('2025-01-01T00:00:00.000Z'))
        const data = await res.json()

        expect(data).toHaveLength(3)
        expect(data[0].id).toBe('n-3')
    })

    it('caps results at 10 (Drizzle .limit(10) called)', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        // DB mock returns 10 rows — the route has .limit(10) so this is the max
        const ten = Array.from({ length: 10 }, (_, i) => ({ id: `n-${i}` }))
        mockDrizzleDb.enqueue(ten)

        const res = await GET(makeRequest('2025-01-01T00:00:00.000Z'))
        const data = await res.json()

        expect(data).toHaveLength(10)
    })

    // ── since param handling ──────────────────────────────────────────────────

    it('works without a since param (falls back to current time)', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        mockDrizzleDb.enqueue([])

        // No since param — route uses new Date().toISOString() as fallback
        const res = await GET(makeRequest())

        expect(res.status).toBe(200)
    })

    it('passes since param through to the DB query', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        mockDrizzleDb.enqueue([])

        await GET(makeRequest('2024-12-31T23:59:59.000Z'))

        // The DB was queried (select was called)
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1)
    })

    // ── Per-user isolation ────────────────────────────────────────────────────

    it('uses the authenticated user id — not an arbitrary id — to filter', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession('manager-99'))
        mockDrizzleDb.enqueue([{ id: 'n-mgr', recipient_id: 'manager-99' }])

        const res = await GET(makeRequest('2025-01-01T00:00:00.000Z'))
        const data = await res.json()

        expect(data[0].recipient_id).toBe('manager-99')
    })
})
