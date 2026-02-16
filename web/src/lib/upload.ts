import { createClient } from '@/utils/supabase/server'

/**
 * Upload equipment images to Supabase Storage
 * @param files - Array of File objects to upload
 * @param sport - Sport category for organizing files
 * @param equipmentId - Equipment ID for organizing files
 * @returns Array of public URLs
 */
export async function uploadEquipmentImages(
    files: File[],
    sport: string,
    equipmentId: string
): Promise<string[]> {
    const supabase = await createClient()
    const uploadedUrls: string[] = []

    for (const file of files) {
        // Generate unique filename
        const timestamp = Date.now()
        const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const filePath = `${sport}/${equipmentId}/${filename}`

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('equipment-images')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            })

        if (error) {
            console.error('Error uploading image:', error)
            throw new Error(`Failed to upload ${file.name}`)
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('equipment-images')
            .getPublicUrl(filePath)

        uploadedUrls.push(publicUrl)
    }

    return uploadedUrls
}

/**
 * Delete equipment images from Supabase Storage
 * @param imageUrls - Array of image URLs to delete
 */
export async function deleteEquipmentImages(imageUrls: string[]): Promise<void> {
    const supabase = await createClient()

    for (const url of imageUrls) {
        try {
            // Extract file path from public URL
            const urlParts = url.split('/storage/v1/object/public/equipment-images/')
            if (urlParts.length < 2) continue

            const filePath = urlParts[1]

            // Delete from storage
            const { error } = await supabase.storage
                .from('equipment-images')
                .remove([filePath])

            if (error) {
                console.error('Error deleting image:', error)
            }
        } catch (err) {
            console.error('Error processing image URL:', err)
        }
    }
}

/**
 * Validate image file
 * @param file - File to validate
 * @returns Error message if invalid, null if valid
 */
export function validateImageFile(file: File): string | null {
    const maxSize = 5 * 1024 * 1024 // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

    if (!allowedTypes.includes(file.type)) {
        return `${file.name}: Invalid file type. Only JPEG, PNG, and WebP are allowed.`
    }

    if (file.size > maxSize) {
        return `${file.name}: File too large. Maximum size is 5MB.`
    }

    return null
}
