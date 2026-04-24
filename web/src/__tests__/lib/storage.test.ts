/**
 * Tests for lib/storage.ts — uploadFile() and deleteFile()
 *
 * fs/promises is mocked so no real disk I/O occurs.
 * The tests verify: path construction, sanitization, error propagation,
 * and the security guard on deleteFile (ignores non-/uploads/ paths).
 */

// storage.ts uses `import fs from 'fs/promises'` (default import).
// We provide only the `default` key so that default-import binding resolves
// to our vi.fn() stubs. importOriginal cannot be used here because spreading
// the real module re-introduces its own `default` property (the real CJS
// module.exports), which wins over our stubs when fs is accessed.
vi.mock('fs/promises', () => ({
    default: {
        mkdir: vi.fn(),
        writeFile: vi.fn(),
        unlink: vi.fn(),
    },
}))

import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs/promises'
import { uploadFile, deleteFile } from '@/lib/storage'

function makeFile(name = 'photo.jpg', content = 'image-bytes', type = 'image/jpeg'): File {
    return new File([content], name, { type })
}

// ─── uploadFile ───────────────────────────────────────────────────────────────

describe('uploadFile', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(fs.mkdir).mockResolvedValue(undefined)
        vi.mocked(fs.writeFile).mockResolvedValue(undefined)
    })

    it('returns null for a zero-size file without touching the filesystem', async () => {
        const empty = new File([], 'empty.jpg', { type: 'image/jpeg' })

        const result = await uploadFile(empty, 'equipment')

        expect(result).toBeNull()
        expect(vi.mocked(fs.mkdir)).not.toHaveBeenCalled()
        expect(vi.mocked(fs.writeFile)).not.toHaveBeenCalled()
    })

    it('creates the target directory with recursive flag', async () => {
        await uploadFile(makeFile(), 'equipment')

        expect(vi.mocked(fs.mkdir)).toHaveBeenCalledWith(
            expect.stringContaining('equipment'),
            { recursive: true }
        )
    })

    it('returns a /uploads/<folder>/<filename> URL', async () => {
        const result = await uploadFile(makeFile('photo.jpg'), 'courts')

        expect(result).toMatch(/^\/uploads\/courts\/\d+-photo\.jpg$/)
    })

    it('prefixes the filename with a timestamp', async () => {
        const before = Date.now()
        const result = await uploadFile(makeFile('x.jpg'), 'test')
        const after = Date.now()

        const ts = parseInt(result!.split('/').pop()!.split('-')[0])
        expect(ts).toBeGreaterThanOrEqual(before)
        expect(ts).toBeLessThanOrEqual(after)
    })

    it('replaces special characters in filename with underscores', async () => {
        const result = await uploadFile(makeFile('my file & stuff!.jpg'), 'test')

        expect(result).toMatch(/my_file___stuff_\.jpg$/)
    })

    it('writes the file buffer to disk', async () => {
        await uploadFile(makeFile('shot.jpg', 'abc'), 'events')

        expect(vi.mocked(fs.writeFile)).toHaveBeenCalledWith(
            expect.stringContaining('shot.jpg'),
            expect.any(Buffer)
        )
    })

    it('returns null when fs.mkdir throws', async () => {
        vi.mocked(fs.mkdir).mockRejectedValue(new Error('permission denied'))

        const result = await uploadFile(makeFile(), 'equipment')

        expect(result).toBeNull()
    })

    it('returns null when fs.writeFile throws', async () => {
        vi.mocked(fs.writeFile).mockRejectedValue(new Error('disk full'))

        const result = await uploadFile(makeFile(), 'equipment')

        expect(result).toBeNull()
    })
})

// ─── deleteFile ───────────────────────────────────────────────────────────────

describe('deleteFile', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(fs.unlink).mockResolvedValue(undefined)
    })

    it('does NOT call unlink for paths that do not start with /uploads/', async () => {
        await deleteFile('/etc/passwd')
        await deleteFile('relative/path')
        await deleteFile('')

        expect(vi.mocked(fs.unlink)).not.toHaveBeenCalled()
    })

    it('calls unlink with the full filesystem path for a valid /uploads/ URL', async () => {
        await deleteFile('/uploads/equipment/1234-photo.jpg')

        expect(vi.mocked(fs.unlink)).toHaveBeenCalledWith(
            expect.stringContaining('1234-photo.jpg')
        )
    })

    it('resolves without throwing when the file is already gone (ENOENT)', async () => {
        const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
        vi.mocked(fs.unlink).mockRejectedValue(err)

        await expect(deleteFile('/uploads/equipment/missing.jpg')).resolves.not.toThrow()
    })

    it('resolves without throwing for any other unlink error (defensive)', async () => {
        vi.mocked(fs.unlink).mockRejectedValue(new Error('unexpected error'))

        await expect(deleteFile('/uploads/test/file.jpg')).resolves.not.toThrow()
    })
})
