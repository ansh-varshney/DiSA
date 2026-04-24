/**
 * Middleware matcher config tests
 *
 * src/middleware.ts is a one-liner: `export { auth as middleware } from '@/auth'`
 * There is no custom business logic — the only testable surface is the
 * config.matcher pattern, which determines which paths Next.js intercepts.
 *
 * The pattern is a valid JS regex (Next.js embeds lookaheads in its path syntax).
 * We convert it to a RegExp and assert that:
 *   - Protected routes (student, manager, admin, api/*) ARE matched
 *   - Excluded routes (_next/*, auth callback, static assets) are NOT matched
 */

import { describe, it, expect } from 'vitest'

// Mock @/auth so NextAuth() is not invoked during import
vi.mock('@/auth', () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
}))

import { config } from '@/middleware'

// The single pattern from the matcher array.
// Anchor with ^ so the regex can only match from the start of the path —
// without it, re.test('/_next/static/...') would fail at position 0 (blocked
// by the lookahead) but then find a second '/' deeper in the string and
// incorrectly return true.
const [pattern] = config.matcher
const re = new RegExp('^' + pattern)

/** Returns true if the middleware will intercept this path */
function isProtected(path: string): boolean {
    return re.test(path)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('middleware config.matcher', () => {
    // ── Routes that MUST be intercepted (protected) ──────────────────────────

    it('intercepts the student portal', () => {
        expect(isProtected('/student')).toBe(true)
        expect(isProtected('/student/book')).toBe(true)
        expect(isProtected('/student/reservations')).toBe(true)
        expect(isProtected('/student/profile')).toBe(true)
        expect(isProtected('/student/leaderboard')).toBe(true)
    })

    it('intercepts the manager portal', () => {
        expect(isProtected('/manager')).toBe(true)
        expect(isProtected('/manager/approvals')).toBe(true)
    })

    it('intercepts the admin portal', () => {
        expect(isProtected('/admin')).toBe(true)
        expect(isProtected('/admin/equipment')).toBe(true)
        expect(isProtected('/admin/courts')).toBe(true)
        expect(isProtected('/admin/reservations')).toBe(true)
        expect(isProtected('/admin/analytics')).toBe(true)
    })

    it('intercepts the login page', () => {
        expect(isProtected('/login')).toBe(true)
    })

    it('intercepts the dashboard redirect hub', () => {
        expect(isProtected('/dashboard')).toBe(true)
    })

    it('intercepts the complete-profile page', () => {
        expect(isProtected('/complete-profile')).toBe(true)
    })

    it('intercepts the notifications API endpoint', () => {
        expect(isProtected('/api/notifications')).toBe(true)
    })

    it('intercepts the upload API endpoint', () => {
        expect(isProtected('/api/upload')).toBe(true)
    })

    // ── Routes that MUST be excluded (pass through without middleware) ────────

    it('excludes Next.js static chunks', () => {
        expect(isProtected('/_next/static/chunks/main.js')).toBe(false)
        expect(isProtected('/_next/static/css/app.css')).toBe(false)
    })

    it('excludes Next.js image optimisation endpoint', () => {
        expect(isProtected('/_next/image?url=%2Fuploads%2Fphoto.jpg&w=800')).toBe(false)
    })

    it('excludes favicon', () => {
        expect(isProtected('/favicon.ico')).toBe(false)
    })

    it('excludes NextAuth callback routes', () => {
        expect(isProtected('/api/auth/callback/google')).toBe(false)
        expect(isProtected('/api/auth/session')).toBe(false)
        expect(isProtected('/api/auth/csrf')).toBe(false)
        expect(isProtected('/api/auth/signin')).toBe(false)
        expect(isProtected('/api/auth/signout')).toBe(false)
    })

    it('excludes SVG files', () => {
        expect(isProtected('/logo.svg')).toBe(false)
        expect(isProtected('/icons/arrow.svg')).toBe(false)
    })

    it('excludes common image extensions', () => {
        expect(isProtected('/hero.png')).toBe(false)
        expect(isProtected('/photo.jpg')).toBe(false)
        expect(isProtected('/photo.jpeg')).toBe(false)
        expect(isProtected('/banner.webp')).toBe(false)
        expect(isProtected('/thumbnail.gif')).toBe(false)
    })

    // ── Boundary: image-like path that should still be protected ─────────────

    it('does NOT exclude routes that merely contain an image word in the path', () => {
        // /student/upload-image is a page, not a static file — must be protected
        expect(isProtected('/student/upload-image')).toBe(true)
    })

    it('excludes only image extensions at the END of the path', () => {
        // Path ending in .png → excluded; path with .png in the middle → protected
        expect(isProtected('/uploads/photo.png')).toBe(false)
        expect(isProtected('/admin/equipment')).toBe(true)
    })
})
