'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateStudentProfile(formData: FormData) {
    const supabase = await createClient()

    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Not authenticated' }

    const branch = (formData.get('branch') as string)?.trim()
    const year = (formData.get('year') as string)?.trim()
    const gender = (formData.get('gender') as string)?.trim()

    if (!branch || !year || !gender) {
        return { error: 'Branch, year, and gender are required' }
    }

    const { error } = await supabase
        .from('profiles')
        .update({ branch, year, gender })
        .eq('id', user.id)

    if (error) return { error: error.message }

    revalidatePath('/student', 'layout')
    revalidatePath('/student/profile')
    return { success: true }
}
