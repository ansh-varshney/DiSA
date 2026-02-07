'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getPendingBookings() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (full_name, phone_number, student_id),
            courts (name, sport)
        `)
        .eq('status', 'pending_confirmation')
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error getting pending bookings:', error)
        return []
    }
    return data
}

export async function updateBookingStatus(bookingId: string, status: 'confirmed' | 'rejected' | 'active' | 'completed' | 'cancelled') {
    const supabase = await createClient()
    const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId)

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/manager')
    return { success: true }
}
