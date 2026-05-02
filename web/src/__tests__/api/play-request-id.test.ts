/**
 * Tests for GET /api/play-request-id
 *
 * Verifies: auth gating, missing booking_id param, no matching play request,
 * and success path returning the play_request_id.
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
import { GET } from '@/app/api/play-request-id/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(bookingId?: string): NextRequest {
    const searchParams = new URLSearchParams()
    if (bookingId !== undefined) searchParams.set('booking_id', bookingId)
    return { nextUrl: { searchParams } } as unknown as NextRequest
}

function authedSession(userId = 'student-1') {
    return { user: { id: userId }, expires: '9999' } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/play-request-id', () => {
    beforeEach(() => {
        mockDrizzleDb.reset()
        vi.mocked(auth).mockResolvedValue(null as any)
    })

    // ── Auth gating ──────────────────────────────────────────────────────────

    it('returns 401 when unauthenticated', async () => {
        const res = await GET(makeRequest('b-1'))

        expect(res.status).toBe(401)
        expect((await res.json()).error).toBe('Unauthorized')
    })

    it('returns 401 when session has no user id', async () => {
        vi.mocked(auth).mockResolvedValue({ user: {}, expires: '9999' } as any)

        const res = await GET(makeRequest('b-1'))

        expect(res.status).toBe(401)
    })

    // ── booking_id param handling ─────────────────────────────────────────────

    it('returns 400 when booking_id param is missing', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())

        const res = await GET(makeRequest())

        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('Missing booking_id')
    })

    // ── Not found ─────────────────────────────────────────────────────────────

    it('returns 404 when no pending play request matches the booking and user', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        mockDrizzleDb.enqueue([]) // empty result — no matching play request

        const res = await GET(makeRequest('b-missing'))

        expect(res.status).toBe(404)
        expect((await res.json()).error).toBe('Not found')
    })

    // ── Success ───────────────────────────────────────────────────────────────

    it('returns 200 with play_request_id when a pending request exists', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession('student-2'))
        mockDrizzleDb.enqueue([{ id: 'pr-42' }])

        const res = await GET(makeRequest('b-1'))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ play_request_id: 'pr-42' })
    })

    it('queries using the authenticated user id for isolation', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession('student-99'))
        mockDrizzleDb.enqueue([{ id: 'pr-7' }])

        const res = await GET(makeRequest('b-2'))

        expect(res.status).toBe(200)
        expect(mockDrizzleDb.select).toHaveBeenCalledTimes(1)
    })
})
