import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock storage I/O — uploadEquipmentImages / deleteEquipmentImages delegate to these
vi.mock('@/lib/storage', () => ({
    uploadFile: vi.fn().mockResolvedValue('/uploads/equipment-images/badminton/eq-1/123-photo.jpg'),
    deleteFile: vi.fn().mockResolvedValue(undefined),
}))

import { uploadFile, deleteFile } from '@/lib/storage'
import { validateImageFile, uploadEquipmentImages, deleteEquipmentImages } from '@/lib/upload'

// ─── validateImageFile ─────────────────────────────────────────────────────────

describe('validateImageFile', () => {
    function makeFile(name: string, type: string, size: number): File {
        return new File(['x'.repeat(size)], name, { type })
    }

    it('returns null for a valid JPEG file under 5MB', () => {
        expect(validateImageFile(makeFile('photo.jpg', 'image/jpeg', 1024))).toBeNull()
    })

    it('returns null for a valid PNG file', () => {
        expect(validateImageFile(makeFile('image.png', 'image/png', 2048))).toBeNull()
    })

    it('returns null for a valid WebP file', () => {
        expect(validateImageFile(makeFile('image.webp', 'image/webp', 512))).toBeNull()
    })

    it('returns null for a valid JPG (image/jpg) file', () => {
        expect(validateImageFile(makeFile('image.jpg', 'image/jpg', 100))).toBeNull()
    })

    it('returns error for invalid file type (PDF)', () => {
        const result = validateImageFile(makeFile('doc.pdf', 'application/pdf', 1024))
        expect(result).not.toBeNull()
        expect(result).toContain('doc.pdf')
        expect(result).toContain('Invalid file type')
    })

    it('returns error for invalid file type (GIF)', () => {
        const result = validateImageFile(makeFile('anim.gif', 'image/gif', 100))
        expect(result).toContain('Invalid file type')
    })

    it('returns error for file exceeding 5MB', () => {
        const result = validateImageFile(makeFile('big.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1))
        expect(result).not.toBeNull()
        expect(result).toContain('big.jpg')
        expect(result).toContain('too large')
    })

    it('returns null for a file exactly at the 5MB limit', () => {
        expect(validateImageFile(makeFile('exact.jpg', 'image/jpeg', 5 * 1024 * 1024))).toBeNull()
    })
})

// ─── uploadEquipmentImages ────────────────────────────────────────────────────

describe('uploadEquipmentImages', () => {
    beforeEach(() => vi.clearAllMocks())

    function makeFile(name: string, size = 1024): File {
        return new File(['x'.repeat(size)], name, { type: 'image/jpeg' })
    }

    it('calls uploadFile for each file and returns URLs', async () => {
        const files = [makeFile('photo1.jpg'), makeFile('photo2.jpg')]
        const urls = await uploadEquipmentImages(files, 'badminton', 'eq-1')

        expect(uploadFile).toHaveBeenCalledTimes(2)
        expect(uploadFile).toHaveBeenCalledWith(files[0], 'equipment-images/badminton/eq-1')
        expect(urls).toHaveLength(2)
    })

    it('returns empty array for empty file list', async () => {
        const urls = await uploadEquipmentImages([], 'badminton', 'eq-1')
        expect(urls).toEqual([])
        expect(uploadFile).not.toHaveBeenCalled()
    })

    it('filters out null results from failed individual uploads', async () => {
        vi.mocked(uploadFile)
            .mockResolvedValueOnce(null) // first fails
            .mockResolvedValueOnce('/uploads/equipment-images/badminton/eq-1/good.jpg') // second succeeds

        const files = [makeFile('bad.jpg'), makeFile('good.jpg')]
        const urls = await uploadEquipmentImages(files, 'badminton', 'eq-1')

        expect(urls).toHaveLength(1)
        expect(urls[0]).toContain('good.jpg')
    })
})

// ─── deleteEquipmentImages ────────────────────────────────────────────────────

describe('deleteEquipmentImages', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls deleteFile for each URL', async () => {
        const urls = [
            '/uploads/equipment-images/badminton/eq-1/photo1.jpg',
            '/uploads/equipment-images/badminton/eq-1/photo2.jpg',
        ]
        await deleteEquipmentImages(urls)

        expect(deleteFile).toHaveBeenCalledTimes(2)
        expect(deleteFile).toHaveBeenCalledWith(urls[0])
        expect(deleteFile).toHaveBeenCalledWith(urls[1])
    })

    it('handles empty list gracefully', async () => {
        await expect(deleteEquipmentImages([])).resolves.toBeUndefined()
        expect(deleteFile).not.toHaveBeenCalled()
    })

    it('handles Supabase-style URLs by delegating to deleteFile (which ignores non-/uploads/ paths)', async () => {
        // deleteFile in storage.ts silently ignores URLs that don't start with /uploads/
        await deleteEquipmentImages(['https://old.supabase.co/storage/v1/object/public/equipment-images/photo.jpg'])
        expect(deleteFile).toHaveBeenCalledTimes(1)
    })
})
