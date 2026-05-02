/**
 * Tests for POST /api/upload
 *
 * Verifies: auth gating, missing file, validation errors, upload failure,
 * successful upload, folder sanitization, and default folder fallback.
 *
 * uploadFile and validateImageFile are fully mocked — no disk I/O occurs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

vi.mock('@/auth', () => ({
    auth: vi.fn(),
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
}))

vi.mock('@/lib/storage', () => ({
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
}))

vi.mock('@/lib/upload', () => ({
    validateImageFile: vi.fn().mockReturnValue(null),
    uploadEquipmentImages: vi.fn(),
    deleteEquipmentImages: vi.fn(),
}))

import { auth } from '@/auth'
import { uploadFile } from '@/lib/storage'
import { validateImageFile } from '@/lib/upload'
import { POST } from '@/app/api/upload/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFile(name = 'photo.jpg', type = 'image/jpeg', sizeBytes = 1024): File {
    const content = 'x'.repeat(sizeBytes)
    return new File([content], name, { type })
}

function makeRequest(file?: File | null, folder?: string): NextRequest {
    const formData = new FormData()
    if (file !== null && file !== undefined) formData.append('file', file)
    if (folder !== undefined) formData.append('folder', folder)
    return {
        formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest
}

function authedSession(userId = 'admin-1') {
    return { user: { id: userId }, expires: '9999' } as any
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/upload', () => {
    beforeEach(() => {
        vi.mocked(auth).mockResolvedValue(null as any)
        vi.mocked(uploadFile).mockResolvedValue(null)
        vi.mocked(validateImageFile).mockReturnValue(null)
    })

    // ── Auth gating ──────────────────────────────────────────────────────────

    it('returns 401 when unauthenticated', async () => {
        vi.mocked(auth).mockResolvedValue(null as any)

        const res = await POST(makeRequest(makeFile()))

        expect(res.status).toBe(401)
        expect((await res.json()).error).toBe('Unauthorized')
    })

    it('returns 401 when session has no user id', async () => {
        vi.mocked(auth).mockResolvedValue({ user: {}, expires: '9999' } as any)

        const res = await POST(makeRequest(makeFile()))

        expect(res.status).toBe(401)
    })

    // ── Missing / empty file ─────────────────────────────────────────────────

    it('returns 400 when no file field is present in the form', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())

        const res = await POST(makeRequest(null))

        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('No file provided')
    })

    it('returns 400 when file has size 0', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' })

        const res = await POST(makeRequest(emptyFile))

        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('No file provided')
    })

    // ── Validation ───────────────────────────────────────────────────────────

    it('returns 400 when validateImageFile returns an error string', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(
            'photo.exe: Invalid file type. Only JPEG, PNG, and WebP are allowed.'
        )

        const res = await POST(makeRequest(makeFile('photo.exe', 'application/octet-stream')))

        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/Invalid file type/)
    })

    it('returns 400 when file is too large', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(
            'big.png: File too large. Maximum size is 5MB.'
        )

        const res = await POST(makeRequest(makeFile('big.png', 'image/png', 6 * 1024 * 1024)))

        expect(res.status).toBe(400)
        expect((await res.json()).error).toMatch(/too large/i)
    })

    // ── Upload failure ───────────────────────────────────────────────────────

    it('returns 500 when uploadFile returns null (disk/IO error)', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue(null)

        const res = await POST(makeRequest(makeFile()))

        expect(res.status).toBe(500)
        expect((await res.json()).error).toBe('Upload failed')
    })

    // ── Success ──────────────────────────────────────────────────────────────

    it('returns 200 with the uploaded URL on success', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue('/uploads/equipment/1735000000000-photo.jpg')

        const res = await POST(makeRequest(makeFile(), 'equipment'))

        expect(res.status).toBe(200)
        expect((await res.json()).url).toBe('/uploads/equipment/1735000000000-photo.jpg')
    })

    it('passes the correct folder to uploadFile', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue('/uploads/courts/file.jpg')

        await POST(makeRequest(makeFile(), 'courts'))

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(expect.any(File), 'courts')
    })

    // ── Folder fallback & sanitization ───────────────────────────────────────

    it('uses "general" as folder when no folder param is supplied', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue('/uploads/general/file.jpg')

        await POST(makeRequest(makeFile()))

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(expect.any(File), 'general')
    })

    it('strips path-traversal sequences from the folder param', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue('/uploads/etcpasswd/file.jpg')

        const formData = new FormData()
        formData.append('file', makeFile())
        formData.append('folder', '../../../etc/passwd')
        const req = { formData: vi.fn().mockResolvedValue(formData) } as unknown as NextRequest

        await POST(req)

        const [, calledFolder] = vi.mocked(uploadFile).mock.calls[0]
        expect(calledFolder).not.toContain('..')
        expect(calledFolder).not.toContain('/')
    })

    it('strips special shell characters from the folder param', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue('/uploads/safe/file.jpg')

        const formData = new FormData()
        formData.append('file', makeFile())
        formData.append('folder', 'equip$(rm -rf *)ment')
        const req = { formData: vi.fn().mockResolvedValue(formData) } as unknown as NextRequest

        await POST(req)

        const [, calledFolder] = vi.mocked(uploadFile).mock.calls[0]
        expect(calledFolder).not.toMatch(/[$();*]/)
    })

    it('falls back to "general" when folder sanitizes to an empty string', async () => {
        vi.mocked(auth).mockResolvedValue(authedSession())
        vi.mocked(validateImageFile).mockReturnValue(null)
        vi.mocked(uploadFile).mockResolvedValue('/uploads/general/file.jpg')

        const formData = new FormData()
        formData.append('file', makeFile())
        formData.append('folder', '!!!@@@###') // all special chars → stripped to ''
        const req = { formData: vi.fn().mockResolvedValue(formData) } as unknown as NextRequest

        await POST(req)

        expect(vi.mocked(uploadFile)).toHaveBeenCalledWith(expect.any(File), 'general')
    })
})
