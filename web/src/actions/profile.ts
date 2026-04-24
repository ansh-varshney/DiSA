'use server'

import { db } from '@/db'
import { profiles } from '@/db/schema'
import { getCurrentUser } from '@/lib/session'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

export async function updateStudentProfile(formData: FormData) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Not authenticated' }

    const branch = (formData.get('branch') as string)?.trim()
    const year = (formData.get('year') as string)?.trim()
    const gender = (formData.get('gender') as string)?.trim()

    if (!branch || !year || !gender) {
        return { error: 'Branch, year, and gender are required' }
    }

    try {
        await db.update(profiles).set({ branch, year, gender }).where(eq(profiles.id, user.id))
    } catch (e: any) {
        return { error: e?.message ?? 'Failed to update profile' }
    }

    revalidatePath('/student', 'layout')
    revalidatePath('/student/profile')
    return { success: true }
}
