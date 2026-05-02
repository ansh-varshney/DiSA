import fs from 'fs/promises'
import path from 'path'

// TODO Phase 5: Replace with proper file storage (MinIO or similar) on VM
// For local dev, files are saved to /public/uploads/ and served by Next.js

export async function uploadFile(file: File, folder: string): Promise<string | null> {
    try {
        if (file.size === 0) return null
        const timestamp = Date.now()
        const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', folder)
        await fs.mkdir(uploadDir, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        await fs.writeFile(path.join(uploadDir, filename), buffer)
        return `/uploads/${folder}/${filename}`
    } catch (err) {
        console.error('uploadFile error:', err)
        return null
    }
}

export async function deleteFile(url: string): Promise<void> {
    try {
        if (!url.startsWith('/uploads/')) return
        const filepath = path.join(process.cwd(), 'public', url)
        await fs.unlink(filepath)
    } catch {
        // File may already be gone — ignore
    }
}
