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

export async function getAvailableEquipment(sport: string, startTime?: string, endTime?: string) {
    const supabase = await createClient()

    // 1. Get all equipment for this sport (not lost)
    const { data: allEquipment, error } = await supabase
        .from('equipment')
        .select('id, name, sport, condition, is_available')
        .ilike('sport', sport)
        .neq('condition', 'lost')
        .order('name')

    if (error) {
        console.error('Error fetching equipment:', error)
        return []
    }

    if (!allEquipment || allEquipment.length === 0) return []

    // 2. If we have a time range, check which equipment is reserved by overlapping bookings
    let reservedIds = new Set<string>()

    if (startTime && endTime) {
        const { data: overlappingBookings } = await supabase
            .from('bookings')
            .select('equipment_ids')
            .neq('status', 'cancelled')
            .neq('status', 'rejected')
            .neq('status', 'completed')
            .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`)

        if (overlappingBookings) {
            overlappingBookings.forEach(b => {
                (b.equipment_ids || []).forEach((id: string) => reservedIds.add(id))
            })
        }
    }

    // 3. Return equipment with in_use flag
    return allEquipment.map(eq => ({
        ...eq,
        in_use: reservedIds.has(eq.id) || !eq.is_available,
    }))
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

    // 0. Prevent booking in the past
    if (startTime < new Date()) {
        return { error: 'Cannot book a slot in the past' }
    }

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

    // 3. Overlap Check — same court
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

    // 3b. Prevent same student from double-booking overlapping time on ANY court
    const { data: studentConflicts } = await supabase
        .from('bookings')
        .select('id')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .or(`and(start_time.lt.${endTime.toISOString()},end_time.gt.${startTime.toISOString()})`)

    if (studentConflicts && studentConflicts.length > 0) {
        return { error: 'You already have a booking during this time' }
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
            status: 'confirmed',
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

export async function withdrawFromBooking(bookingId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch the booking
    const { data: booking } = await supabase
        .from('bookings')
        .select('user_id, status, players_list, num_players')
        .eq('id', bookingId)
        .single()

    if (!booking) return { error: 'Booking not found' }

    // Can't withdraw if you're the booker — use cancel instead
    if (booking.user_id === user.id) {
        return { error: 'You are the booker. Use cancel instead.' }
    }

    // Can only withdraw from active/confirmed bookings
    if (!['pending_confirmation', 'confirmed'].includes(booking.status)) {
        return { error: 'Cannot withdraw from this booking' }
    }

    // Remove user from players_list
    const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
    const updatedPlayersList = playersList.filter((p: any) => {
        const playerId = typeof p === 'string' ? p : p?.id
        return playerId !== user.id
    })

    const newNumPlayers = Math.max(1, (booking.num_players || 2) - 1)

    const { error } = await supabase
        .from('bookings')
        .update({
            players_list: updatedPlayersList,
            num_players: newNumPlayers,
        })
        .eq('id', bookingId)

    if (error) return { error: error.message }

    revalidatePath('/student/reservations')
    revalidatePath('/student')
    revalidatePath('/student/book')
    revalidatePath('/manager')
    revalidatePath('/admin/reservations')
    return { success: true }
}

export async function getStudentBookings(userId: string) {
    const supabase = await createClient()
    const now = new Date()

    // 1. Bookings the student created
    const { data: ownBookings, error: ownError } = await supabase
        .from('bookings')
        .select(`
            *,
            courts (name, sport)
        `)
        .eq('user_id', userId)
        .order('start_time', { ascending: false })

    // 2. Bookings where the student was added as a player
    //    players_list is JSONB array of objects: [{id, full_name, ...}]
    const { data: playerBookings, error: playerError } = await supabase
        .from('bookings')
        .select(`
            *,
            courts (name, sport)
        `)
        .neq('user_id', userId)
        .contains('players_list', JSON.stringify([{ id: userId }]))
        .order('start_time', { ascending: false })

    if (ownError) console.error('Error fetching own bookings:', ownError)
    if (playerError) console.error('Error fetching player bookings:', playerError)

    // 3. Merge and deduplicate
    const allBookings = [...(ownBookings || []), ...(playerBookings || [])]
    const seen = new Set<string>()
    const data = allBookings.filter(b => {
        if (seen.has(b.id)) return false
        seen.add(b.id)
        return true
    })

    const current = data.filter((b: any) =>
        b.status === 'active' &&
        new Date(b.start_time) <= now &&
        new Date(b.end_time) >= now
    )

    const upcoming = data.filter((b: any) =>
        ['pending_confirmation', 'confirmed'].includes(b.status) &&
        new Date(b.end_time) > now
    )

    const past = data.filter((b: any) =>
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
