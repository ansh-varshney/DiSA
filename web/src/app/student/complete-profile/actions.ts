'use server'

import { auth } from '@/auth'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function completeStudentProfile(formData: FormData) {
    const session = await auth()
    if (!session?.user?.id) return { error: 'Not authenticated' }

    const branch = formData.get('branch') as string
    const year = formData.get('year') as string
    const gender = formData.get('gender') as string
    const studentId = formData.get('studentId') as string | null
    const phone_number = (formData.get('phone_number') as string)?.trim() || null

    if (!branch || !year || !gender) {
        return { error: 'Branch, year, and gender are required' }
    }

    const updateData: Record<string, string> = { branch, year, gender }
    if (studentId?.trim()) updateData.student_id = studentId.trim()
    if (phone_number) updateData.phone_number = phone_number

    await db.update(profiles).set(updateData).where(eq(profiles.id, session.user.id))

    revalidatePath('/student', 'layout')
    redirect('/student')
}
