'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getCourts() {
    const supabase = await createClient()
    const { data, error } = await supabase.from('courts').select('*').order('name')

    if (error) {
        console.error('Error fetching courts:', error)
        return []
    }

    return data
}

export async function getActiveCourts() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('courts')
        .select('*')
        .eq('is_active', true)
        .order('name')

    if (error) {
        console.error('Error fetching active courts:', error)
        return []
    }

    return data
}

export async function createCourt(formData: FormData) {
    const supabase = await createClient()

    // Basic validation would go here
    const name = formData.get('name') as string
    const sport = formData.get('sport') as string
    const type = formData.get('type') as string
    const capacity = Number(formData.get('capacity')) || 4

    const { error } = await supabase.from('courts').insert({
        name,
        sport,
        type,
        capacity,
    })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/admin/courts')
    return { success: true }
}
