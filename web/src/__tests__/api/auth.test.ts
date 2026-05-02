/**
 * Tests for GET|POST /api/auth/[...nextauth]
 *
 * The route is a thin re-export of next-auth's handlers.
 * We verify that the module exports callable GET and POST handlers
 * so that the route file itself gets coverage.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('@/auth', () => ({
    auth: vi.fn(),
    handlers: {
        GET: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
        POST: vi.fn().mockResolvedValue(new Response('ok', { status: 200 })),
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
}))

import { GET, POST } from '@/app/api/auth/[...nextauth]/route'

describe('GET|POST /api/auth/[...nextauth]', () => {
    it('exports a callable GET handler', () => {
        expect(typeof GET).toBe('function')
    })

    it('exports a callable POST handler', () => {
        expect(typeof POST).toBe('function')
    })

    it('GET handler returns a Response', async () => {
        const req = new Request('http://localhost/api/auth/session')
        const res = await GET(req as any)
        expect(res).toBeInstanceOf(Response)
    })

    it('POST handler returns a Response', async () => {
        const req = new Request('http://localhost/api/auth/signin', { method: 'POST' })
        const res = await POST(req as any)
        expect(res).toBeInstanceOf(Response)
    })
})
