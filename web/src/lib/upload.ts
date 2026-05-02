import { uploadFile, deleteFile } from '@/lib/storage'

// ─── Validation ───────────────────────────────────────────────────────────────

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export function validateImageFile(file: File): string | null {
    if (!ALLOWED_TYPES.includes(file.type)) {
        return `${file.name}: Invalid file type. Only JPEG, PNG, and WebP are allowed.`
    }
    if (file.size > MAX_SIZE) {
        return `${file.name}: File too large. Maximum size is 5MB.`
    }
    return null
}

// ─── Equipment images ─────────────────────────────────────────────────────────

export async function uploadEquipmentImages(
    files: File[],
    sport: string,
    equipmentId: string
): Promise<string[]> {
    const urls: string[] = []
    for (const file of files) {
        const url = await uploadFile(file, `equipment-images/${sport}/${equipmentId}`)
        if (url) urls.push(url)
    }
    return urls
}

export async function deleteEquipmentImages(imageUrls: string[]): Promise<void> {
    for (const url of imageUrls) {
        await deleteFile(url)
    }
}
