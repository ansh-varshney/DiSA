'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function completeStudentProfile(formData: FormData) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const branch = formData.get('branch') as string
    const year = formData.get('year') as string
    const gender = formData.get('gender') as string
    const studentId = formData.get('studentId') as string | null

    if (!branch || !year || !gender) {
        return { error: 'Branch, year, and gender are required' }
    }

    const updateData: Record<string, string> = { branch, year, gender }
    if (studentId?.trim()) updateData.student_id = studentId.trim()

    const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/student', 'layout')
    redirect('/student')
}
