import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')

import { createClient } from '@/utils/supabase/server'

import { uploadEquipmentImages, deleteEquipmentImages, validateImageFile } from '@/lib/upload'

// ─── validateImageFile ─────────────────────────────────────────────────────────

describe('validateImageFile', () => {
    function makeFile(name: string, type: string, size: number): File {
        const file = new File(['x'.repeat(size)], name, { type })
        return file
    }

    it('returns null for a valid JPEG file under 5MB', () => {
        const file = makeFile('photo.jpg', 'image/jpeg', 1024)
        expect(validateImageFile(file)).toBeNull()
    })

    it('returns null for a valid PNG file', () => {
        const file = makeFile('image.png', 'image/png', 2048)
        expect(validateImageFile(file)).toBeNull()
    })

    it('returns null for a valid WebP file', () => {
        const file = makeFile('image.webp', 'image/webp', 512)
        expect(validateImageFile(file)).toBeNull()
    })

    it('returns null for a valid JPG (image/jpg) file', () => {
        const file = makeFile('image.jpg', 'image/jpg', 100)
        expect(validateImageFile(file)).toBeNull()
    })

    it('returns error for invalid file type (PDF)', () => {
        const file = makeFile('doc.pdf', 'application/pdf', 1024)
        const result = validateImageFile(file)
        expect(result).not.toBeNull()
        expect(result).toContain('doc.pdf')
        expect(result).toContain('Invalid file type')
    })

    it('returns error for invalid file type (GIF)', () => {
        const file = makeFile('anim.gif', 'image/gif', 100)
        const result = validateImageFile(file)
        expect(result).toContain('Invalid file type')
    })

    it('returns error for file exceeding 5MB', () => {
        const fiveMBPlusOne = 5 * 1024 * 1024 + 1
        const file = makeFile('big.jpg', 'image/jpeg', fiveMBPlusOne)
        const result = validateImageFile(file)
        expect(result).not.toBeNull()
        expect(result).toContain('big.jpg')
        expect(result).toContain('too large')
    })

    it('returns null for a file exactly at 5MB limit', () => {
        const fiveMB = 5 * 1024 * 1024
        const file = makeFile('exact.jpg', 'image/jpeg', fiveMB)
        expect(validateImageFile(file)).toBeNull()
    })
})

// ─── uploadEquipmentImages ────────────────────────────────────────────────────

describe('uploadEquipmentImages', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeFile(name: string, size = 1024): File {
        return new File(['x'.repeat(size)], name, { type: 'image/jpeg' })
    }

    it('uploads files and returns public URLs', async () => {
        const db = makeMockDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const files = [makeFile('photo1.jpg'), makeFile('photo2.jpg')]
        const urls = await uploadEquipmentImages(files, 'badminton', 'eq-1')

        expect(urls).toHaveLength(2)
        expect(urls[0]).toBe('https://mock.url/img.jpg')
    })

    it('returns empty array for empty file list', async () => {
        const db = makeMockDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const urls = await uploadEquipmentImages([], 'badminton', 'eq-1')
        expect(urls).toEqual([])
    })

    it('throws when storage upload fails', async () => {
        const db = makeMockDb()
        ;(db.client.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: { message: 'upload failed' } }),
            getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
            remove: vi.fn().mockResolvedValue({ error: null }),
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const files = [makeFile('photo.jpg')]
        await expect(uploadEquipmentImages(files, 'badminton', 'eq-1')).rejects.toThrow('Failed to upload photo.jpg')
    })
})

// ─── deleteEquipmentImages ────────────────────────────────────────────────────

describe('deleteEquipmentImages', () => {
    beforeEach(() => vi.clearAllMocks())

    it('deletes images by extracting file path from URL', async () => {
        const db = makeMockDb()
        const removeMock = vi.fn().mockResolvedValue({ error: null })
        ;(db.client.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
            upload: vi.fn(),
            getPublicUrl: vi.fn(),
            remove: removeMock,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const urls = [
            'https://example.com/storage/v1/object/public/equipment-images/badminton/eq-1/photo.jpg',
        ]
        await deleteEquipmentImages(urls)

        expect(removeMock).toHaveBeenCalledWith(['badminton/eq-1/photo.jpg'])
    })

    it('skips URLs that do not contain the storage path pattern', async () => {
        const db = makeMockDb()
        const removeMock = vi.fn().mockResolvedValue({ error: null })
        ;(db.client.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
            upload: vi.fn(),
            getPublicUrl: vi.fn(),
            remove: removeMock,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await deleteEquipmentImages(['https://other.example.com/image.jpg'])
        expect(removeMock).not.toHaveBeenCalled()
    })

    it('handles empty URL list gracefully', async () => {
        const db = makeMockDb()
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await expect(deleteEquipmentImages([])).resolves.toBeUndefined()
    })
})
