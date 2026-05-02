import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { uploadFile } from '@/lib/storage'
import { validateImageFile } from '@/lib/upload'

export async function POST(request: NextRequest) {
    const session = await auth()
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    // Sanitize folder: allow only alphanumeric, hyphens, underscores, slashes
    const rawFolder = (formData.get('folder') as string | null) ?? 'general'
    const folder = rawFolder.replace(/[^a-zA-Z0-9/_-]/g, '').slice(0, 100) || 'general'

    if (!file || file.size === 0) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const validationError = validateImageFile(file)
    if (validationError) {
        return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const url = await uploadFile(file, folder)
    if (!url) {
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    return NextResponse.json({ url })
}
