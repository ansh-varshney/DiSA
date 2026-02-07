'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { addMinutes, areIntervalsOverlapping, startOfDay, endOfDay, addDays } from 'date-fns'

export async function getBookingsForDateRange(courtId: string, startDate: Date, endDate: Date) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (full_name)
        `)
        .eq('court_id', courtId)
        .gte('start_time', startDate.toISOString())
        .lte('end_time', endDate.toISOString())
        .neq('status', 'cancelled')
        .neq('status', 'rejected')

    if (error) {
        console.error('Error fetching bookings:', error)
        return []
    }

    return data
}

export async function createBooking(prevState: any, formData: FormData) {
    const supabase = await createClient()

    const courtId = formData.get('courtId') as string
    const startTimeStr = formData.get('startTime') as string // ISO string
    const durationParam = formData.get('duration') as string // '30' or '60'
    const playersStr = formData.get('players') as string // JSON string of player IDs

    if (!courtId || !startTimeStr || !durationParam) {
        return { error: 'Missing required booking details' }
    }

    const startTime = new Date(startTimeStr)
    const duration = parseInt(durationParam)
    const endTime = addMinutes(startTime, duration)

    // 1. Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 2. Overlap Check
    // We check if any booking exists that overlaps with [startTime, endTime)
    // Supabase range types or simple overlap logic in SQL is best, but logic here for simplicity
    const { data: conflictingBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('court_id', courtId)
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .or(`and(start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()})`)

    if (conflictingBookings && conflictingBookings.length > 0) {
        return { error: 'Time slot is already booked' }
    }

    // 3. Insert Booking
    const { error } = await supabase
        .from('bookings')
        .insert({
            user_id: user.id,
            court_id: courtId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            status: 'pending_confirmation', // Default status
            players_list: playersStr ? JSON.parse(playersStr) : []
        })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/student/book')
    return { success: true }
}

// Helper to check user eligibility (Stub)
// export async function checkEligibility(userId: string) { ... }
