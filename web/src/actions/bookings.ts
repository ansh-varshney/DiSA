'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { addMinutes } from 'date-fns'

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

export async function getAvailableEquipment(sport: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('equipment')
        .select('id, name, sport, condition')
        .eq('sport', sport)
        .eq('is_available', true)
        .neq('condition', 'lost')
        .order('name')

    if (error) {
        console.error('Error fetching equipment:', error)
        return []
    }

    return data || []
}

export async function createBooking(prevState: any, formData: FormData) {
    const supabase = await createClient()

    const courtId = formData.get('courtId') as string
    const startTimeStr = formData.get('startTime') as string
    const durationParam = formData.get('duration') as string
    const equipmentIdsStr = formData.get('equipmentIds') as string
    const numPlayersStr = formData.get('numPlayers') as string
    const playersListStr = formData.get('playersList') as string

    if (!courtId || !startTimeStr || !durationParam) {
        return { error: 'Missing required booking details' }
    }

    const startTime = new Date(startTimeStr)
    const duration = parseInt(durationParam)
    const endTime = addMinutes(startTime, duration)

    // 1. Check if user is logged in
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 2. Check if student is banned (3+ violations)
    const { count: violationCount } = await supabase
        .from('student_violations')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)

    if (violationCount && violationCount >= 3) {
        return { error: 'Your account has been suspended due to 3 or more violations. Contact admin.' }
    }

    // 3. Overlap Check
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

    // 4. Parse optional fields
    const equipmentIds = equipmentIdsStr ? JSON.parse(equipmentIdsStr) : []
    const numPlayers = numPlayersStr ? parseInt(numPlayersStr) : 2
    const playersList = playersListStr ? JSON.parse(playersListStr) : []

    // 5. Mark equipment as unavailable (reserved)
    if (equipmentIds.length > 0) {
        await supabase
            .from('equipment')
            .update({ is_available: false })
            .in('id', equipmentIds)
    }

    // 6. Insert Booking
    const { error } = await supabase
        .from('bookings')
        .insert({
            user_id: user.id,
            court_id: courtId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            status: 'pending_confirmation',
            players_list: playersList,
            equipment_ids: equipmentIds,
            num_players: numPlayers,
        })

    if (error) {
        // If booking insert fails, re-free the equipment
        if (equipmentIds.length > 0) {
            await supabase
                .from('equipment')
                .update({ is_available: true })
                .in('id', equipmentIds)
        }
        return { error: error.message }
    }

    revalidatePath('/student/book')
    revalidatePath('/student/reservations')
    return { success: true }
}

export async function cancelBooking(bookingId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch booking to verify ownership and get equipment
    const { data: booking } = await supabase
        .from('bookings')
        .select('user_id, status, equipment_ids')
        .eq('id', bookingId)
        .single()

    if (!booking) return { error: 'Booking not found' }
    if (booking.user_id !== user.id) return { error: 'Not your booking' }
    if (!['pending_confirmation', 'confirmed'].includes(booking.status)) {
        return { error: 'Cannot cancel this booking' }
    }

    // Free equipment first (match manager's behaviour)
    const equipmentIds: string[] = booking.equipment_ids || []
    if (equipmentIds.length > 0) {
        await supabase
            .from('equipment')
            .update({ is_available: true })
            .in('id', equipmentIds)
    }

    const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)

    if (error) return { error: error.message }

    revalidatePath('/student/reservations')
    revalidatePath('/student')
    return { success: true }
}

export async function getStudentBookings(userId: string) {
    const supabase = await createClient()
    const now = new Date()

    const { data, error } = await supabase
        .from('bookings')
        .select(`
            *,
            courts (name, sport)
        `)
        .eq('user_id', userId)
        .order('start_time', { ascending: false })

    if (error) {
        console.error('Error fetching student bookings:', error)
        return { current: [], upcoming: [], past: [] }
    }

    const current = (data || []).filter((b: any) =>
        b.status === 'active' &&
        new Date(b.start_time) <= now &&
        new Date(b.end_time) >= now
    )

    const upcoming = (data || []).filter((b: any) =>
        ['pending_confirmation', 'confirmed'].includes(b.status) &&
        new Date(b.end_time) > now
    )

    const past = (data || []).filter((b: any) =>
        b.status === 'completed' ||
        b.status === 'cancelled' ||
        b.status === 'rejected' ||
        (new Date(b.end_time) < now && !['active'].includes(b.status))
    )

    return { current, upcoming, past }
}

// ─── Student Emergency Alert ──────────────────────────────────────────────────
// Called from active-session.tsx. Writes to feedback_complaints so admin can see it.
export async function studentEmergencyAlert(bookingId: string, reason: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { error } = await supabase
        .from('feedback_complaints')
        .insert({
            student_id: user.id,
            booking_id: bookingId,
            title: 'Emergency Alert (Student)',
            description: reason,
            category: 'emergency_by_student',
            status: 'open',
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/feedback')
    return { success: true }
}

// ─── Submit Feedback / Complaint ──────────────────────────────────────────────
export async function submitFeedback(title: string, description: string, category: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    if (!title.trim() || !description.trim()) {
        return { error: 'Title and description are required' }
    }

    const { error } = await supabase
        .from('feedback_complaints')
        .insert({
            student_id: user.id,
            title: title.trim(),
            description: description.trim(),
            category,
            status: 'open',
        })

    if (error) return { error: error.message }

    revalidatePath('/admin/feedback')
    return { success: true }
}

// ─── Search Students (for Player Picker) ──────────────────────────────────────
export async function searchStudents(query: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    if (!query || query.trim().length < 2) return []

    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, student_id')
        .eq('role', 'student')
        .neq('id', user.id) // Don't show yourself
        .ilike('full_name', `%${query.trim()}%`)
        .limit(10)

    if (error) {
        console.error('Error searching students:', error)
        return []
    }

    return data || []
}
