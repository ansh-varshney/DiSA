'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'



export async function getCurrentBookings() {
    const supabase = await createClient()
    const now = new Date()
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // 1. Fetch bookings for today
    //    ΓÇó Active bookings show if end_time is within the last 1 hour (manager can still end them)
    //    ΓÇó Non-active bookings show only if end_time is still in the future
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (full_name, role),
            courts (name, sport)
        `)
        .in('status', ['pending_confirmation', 'confirmed', 'waiting_manager', 'active'])
        .lte('start_time', next24h.toISOString())
        .or(`and(status.eq.active,end_time.gte.${oneHourAgo.toISOString()}),end_time.gte.${now.toISOString()}`)
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching current bookings:', error)
        return []
    }

    if (!bookings || bookings.length === 0) return []

    // 2. Extract all unique equipment IDs
    const allEquipmentIds = Array.from(new Set(
        bookings.flatMap(b => b.equipment_ids || [])
    ))

    // 3. Fetch equipment details if any exist
    let equipmentMap = new Map()
    if (allEquipmentIds.length > 0) {
        const { data: equipmentList } = await supabase
            .from('equipment')
            .select('id, name')
            .in('id', allEquipmentIds)

        if (equipmentList) {
            equipmentList.forEach(eq => equipmentMap.set(eq.id, eq.name))
        }
    }

    // 4. Attach equipment names to bookings
    return bookings.map(booking => ({
        ...booking,
        equipment_names: (booking.equipment_ids || [])
            .map((id: string) => equipmentMap.get(id))
            .filter(Boolean)
    }))
}

export async function getUnderMaintenanceCourts() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('courts')
        .select('*')
        .or('is_active.eq.false,maintenance_notes.neq.null')
    // Note: checking if notes are not null AND not empty string would be ideal, 
    // but Supabase/PostgREST 'neq' null is a good start. 
    // We can filter client side or refine query if needed.

    if (error) {
        console.error('Error fetching maintenance courts:', error)
        return []
    }

    // Filter out active courts with empty string notes effectively
    const disabledCourts = data.filter(court => !court.is_active || (court.maintenance_notes && court.maintenance_notes.trim() !== ''))

    // ALSO fetch courts with maintenance bookings for the ENTIRE DAY (not just right now)
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const { data: maintenanceBookings } = await supabase
        .from('bookings')
        .select(`
            id,
            court_id,
            start_time,
            end_time,
            courts (id, name, sport)
        `)
        .eq('is_maintenance', true)
        .not('status', 'eq', 'cancelled')
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true })

    // Build a list of maintenance slots (court + time window)
    const maintenanceBookingCourts = maintenanceBookings?.map((b: any) => ({
        id: b.id, // Use booking ID as key to allow multiple slots per court
        court_id: b.courts.id,
        name: b.courts.name,
        sport: b.courts.sport,
        maintenance_notes: 'Scheduled Maintenance',
        start_time: b.start_time,
        end_time: b.end_time,
        is_active: true,
        is_booking_slot: true
    })) || []

    // For courts that are permanently disabled, mark them differently
    const formattedDisabledCourts = disabledCourts.map((c: any) => ({
        ...c,
        is_booking_slot: false
    }))

    // Combine: permanently disabled courts + today's maintenance booking slots
    return [...formattedDisabledCourts, ...maintenanceBookingCourts]
}

// Keep existing getPendingBookings for now as it might be used elsewhere or reference
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

    // If ending/cancelling, first fetch the booking to get equipment_ids
    const terminalStatuses = ['cancelled', 'rejected', 'completed']
    let equipmentIds: string[] = []

    if (terminalStatuses.includes(status)) {
        const { data: booking } = await supabase
            .from('bookings')
            .select('equipment_ids')
            .eq('id', bookingId)
            .single()
        equipmentIds = booking?.equipment_ids || []
    }

    // Update booking status
    const { error } = await supabase
        .from('bookings')
        .update({ status })
        .eq('id', bookingId)

    if (error) {
        return { error: error.message }
    }

    // Free equipment if terminal status
    if (equipmentIds.length > 0) {
        await supabase
            .from('equipment')
            .update({ is_available: true })
            .in('id', equipmentIds)
    }

    revalidatePath('/manager')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    return { success: true }
}

export async function getBookingDetails(bookingId: string) {
    const supabase = await createClient()

    // 1. Fetch booking with core relations
    const { data: booking, error } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (*),
            courts (*)
        `)
        .eq('id', bookingId)
        .single()

    if (error || !booking) {
        console.error('Error fetching booking details:', error)
        return null
    }

    const now = new Date()
    const startTime = new Date(booking.start_time)
    const tenMinutesAfterStart = new Date(startTime.getTime() + 10 * 60 * 1000)

    // 2. Lazy Expiration Check
    // If pending/waiting AND it's been more than 10 mins since start -> Auto Cancel
    const isPending = ['pending_confirmation', 'waiting_manager'].includes(booking.status)
    if (isPending && now > tenMinutesAfterStart) {
        // Auto-cancel
        await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId)

        booking.status = 'cancelled' // Return updated status
    }

    // 3. Fetch Equipment Details
    let equipmentList: any[] = []
    if (booking.equipment_ids && booking.equipment_ids.length > 0) {
        const { data: equip } = await supabase
            .from('equipment')
            .select('*')
            .in('id', booking.equipment_ids)
        if (equip) equipmentList = equip
    }

    // 4. Fetch All Players Details
    // players_list is a JSON structure. Assuming array of UUID strings based on creation logic.
    let allPlayers: any[] = []

    // Always include the main booker (User)
    allPlayers.push({
        ...booking.profiles,
        is_booker: true
    })

    const rawPlayersList = Array.isArray(booking.players_list) ? booking.players_list : []

    // Handle both formats: array of UUID strings OR array of {id, full_name, ...} objects
    const playerIds = rawPlayersList.map((entry: any) =>
        typeof entry === 'string' ? entry : entry?.id
    ).filter(Boolean)

    // Filter out the booker ID if it happens to be in the list to avoid duplicates
    const additionalPlayerIds = playerIds.filter((id: string) => id !== booking.profiles.id)

    if (additionalPlayerIds.length > 0) {
        const { data: extraPlayers } = await supabase
            .from('profiles')
            .select('*')
            .in('id', additionalPlayerIds)

        if (extraPlayers) {
            allPlayers.push(...extraPlayers.map(p => ({ ...p, is_booker: false })))
        }
    }

    return {
        ...booking,
        equipment: equipmentList,
        all_players: allPlayers
    }
}

export async function rejectWithReason(
    bookingId: string,
    reason: string,
    customReason: string | null,
    playerIds: string[]
) {
    const supabase = await createClient()

    // 1. Fetch booking to get equipment before cancelling
    const { data: bookingData } = await supabase
        .from('bookings')
        .select('equipment_ids')
        .eq('id', bookingId)
        .single()
    const equipmentIds: string[] = bookingData?.equipment_ids || []

    // 2. Cancel the booking
    const { error: cancelError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)

    if (cancelError) {
        return { error: cancelError.message }
    }

    // 3. Free equipment
    if (equipmentIds.length > 0) {
        await supabase
            .from('equipment')
            .update({ is_available: true })
            .in('id', equipmentIds)
    }

    // 2. Issue warnings to all student players (skip admins/managers/superusers)
    // Fetch player roles to avoid warning admins
    const { data: players } = await supabase
        .from('profiles')
        .select('id, role')
        .in('id', playerIds)

    const studentIds = players?.filter(p => p.role === 'student').map(p => p.id) || []

    if (studentIds.length > 0) {
        // Insert a violation record for each student
        const violations = studentIds.map(studentId => ({
            student_id: studentId,
            booking_id: bookingId,
            violation_type: reason,
            severity: 'minor' as const,
            reason: customReason || reason,
        }))

        const { error: violationError } = await supabase
            .from('student_violations')
            .insert(violations)

        if (violationError) {
            console.error('Error inserting violations:', violationError)
            // Non-fatal: booking is already cancelled, just log
        }
    }

    revalidatePath('/manager')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    return { success: true }
}

// ΓöÇΓöÇΓöÇ Helper: free equipment for a booking ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
async function freeBookingEquipment(supabase: any, bookingId: string) {
    const { data: booking } = await supabase
        .from('bookings')
        .select('equipment_ids')
        .eq('id', bookingId)
        .single()

    const equipmentIds: string[] = booking?.equipment_ids || []
    if (equipmentIds.length > 0) {
        await supabase
            .from('equipment')
            .update({ is_available: true })
            .in('id', equipmentIds)
    }
    return equipmentIds
}

// ΓöÇΓöÇΓöÇ Emergency End Session ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export async function emergencyEndSession(bookingId: string, reason: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 1. Free equipment
    await freeBookingEquipment(supabase, bookingId)

    // 2. Mark booking completed
    const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', bookingId)
    if (bookingError) return { error: bookingError.message }

    // 3. Create a feedback_complaint entry with category = emergency_by_manager
    await supabase
        .from('feedback_complaints')
        .insert({
            student_id: user.id,          // manager who filed it
            booking_id: bookingId,
            title: 'Emergency Session End',
            description: reason,
            category: 'emergency_by_manager',
            status: 'open',
        })

    revalidatePath('/manager')
    revalidatePath('/admin/feedback')
    revalidatePath('/admin/reservations')
    return { success: true }
}

// ΓöÇΓöÇΓöÇ Update Equipment Conditions ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// (Usage count increment is handled inside endSession for correctness)
export async function updateEquipmentConditions(
    conditions: { id: string; condition: 'good' | 'minor_damage' | 'damaged' }[]
) {
    const supabase = await createClient()

    await Promise.all(
        conditions.map(({ id, condition }) =>
            supabase
                .from('equipment')
                .update({ condition })
                .eq('id', id)
        )
    )

    return { success: true }
}

// ΓöÇΓöÇΓöÇ Report Lost Equipment ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export async function reportLostEquipment(
    bookingId: string,
    equipmentIds: string[],
    playerIds: string[]
) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    console.log('=== reportLostEquipment called ===')
    console.log('bookingId:', bookingId)
    console.log('equipmentIds:', equipmentIds)
    console.log('playerIds:', playerIds)
    console.log('manager user.id:', user.id)

    // 1. Fetch equipment names
    const { data: items } = await supabase
        .from('equipment')
        .select('id, name, equipment_id')
        .in('id', equipmentIds)
    const names = items?.map((i: any) => i.name).join(', ') || 'Unknown equipment'
    console.log('Equipment names:', names)

    // 2. Mark equipment as UNAVAILABLE (it's lost)
    const { error: equipError } = await supabase
        .from('equipment')
        .update({ is_available: false, condition: 'lost' })
        .in('id', equipmentIds)
    console.log('Equipment update error:', equipError)

    // 3. Find future bookings that have any of these equipment IDs reserved
    //    Remove the lost equipment from their equipment_ids (don't cancel the booking)
    const now = new Date().toISOString()
    const { data: futureBookings } = await supabase
        .from('bookings')
        .select('id, user_id, equipment_ids, start_time, courts(name)')
        .gte('start_time', now)
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .neq('status', 'completed')

    const impactedBookings = (futureBookings || []).filter((b: any) =>
        Array.isArray(b.equipment_ids) &&
        b.equipment_ids.some((eid: string) => equipmentIds.includes(eid))
    )

    // Remove lost equipment from impacted bookings (keep the booking itself)
    for (const b of impactedBookings) {
        const updatedIds = (b.equipment_ids as string[]).filter(
            (eid: string) => !equipmentIds.includes(eid)
        )
        await supabase
            .from('bookings')
            .update({ equipment_ids: updatedIds })
            .eq('id', b.id)
    }

    // 4. Issue violation warnings to ALL players involved (shows in defaulters)
    if (playerIds.length > 0) {
        const violations = playerIds.map((playerId: string) => ({
            student_id: playerId,
            booking_id: bookingId,
            violation_type: 'lost_equipment',
            severity: 'severe',
            reason: `Equipment lost during booking: ${names}`,
            reported_by: user.id,
        }))
        console.log('Inserting violations:', JSON.stringify(violations))
        const { error: violationError, data: violationData } = await supabase.from('student_violations').insert(violations).select()
        console.log('Violation insert result:', violationData)
        console.log('Violation insert error:', violationError)
    } else {
        console.warn('reportLostEquipment: No players provided')
    }

    revalidatePath('/admin/defaulters')
    revalidatePath('/admin/equipment')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    return { success: true, impactedBookingsCount: impactedBookings.length }
}

// ΓöÇΓöÇΓöÇ Report Student Post-Session ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export async function reportStudentPostSession(
    bookingId: string,
    studentId: string,
    reason: string,
    customReason: string | null
) {
    const supabase = await createClient()

    // Issue violation warning
    await supabase.from('student_violations').insert({
        student_id: studentId,
        booking_id: bookingId,
        violation_type: reason,
        severity: 'minor',
        reason: customReason || reason,
    })

    revalidatePath('/admin/defaulters')
    return { success: true }
}

// ΓöÇΓöÇΓöÇ End Session (normal end) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export async function endSession(
    bookingId: string,
    equipmentConditions: { id: string; condition: 'good' | 'minor_damage' | 'damaged' }[]
) {
    const supabase = await createClient()

    // 1. Update equipment conditions and free them
    for (const { id, condition } of equipmentConditions) {
        // First get current usage count
        const { data: equip } = await supabase
            .from('equipment')
            .select('total_usage_count')
            .eq('id', id)
            .single()

        await supabase
            .from('equipment')
            .update({
                condition: condition,
                is_available: true,
                total_usage_count: (equip?.total_usage_count || 0) + 1
            })
            .eq('id', id)
    }

    // If no items had conditions specified, still free by booking
    if (equipmentConditions.length === 0) {
        await freeBookingEquipment(supabase, bookingId)
    }

    // 2. Mark booking completed
    await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', bookingId)

    revalidatePath('/manager')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    return { success: true }
}

// ─── Expire Booking (10-min timeout) ──────────────────────────────────────────
// Called from manager-approval-screen when booking isn't accepted within 10 mins.
// Cancels booking, frees equipment, issues violations to all players.
export async function expireBooking(bookingId: string, playerIds: string[]) {
    const supabase = await createClient()

    // 1. Check booking is still pending (avoid duplicate calls)
    const { data: booking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', bookingId)
        .single()

    if (!booking || ['cancelled', 'rejected', 'completed', 'active'].includes(booking.status)) {
        return { already_handled: true }
    }

    // 2. Free equipment
    await freeBookingEquipment(supabase, bookingId)

    // 3. Cancel the booking
    await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)

    // 4. Issue violations to all involved students (filter out non-students)
    if (playerIds.length > 0) {
        // Fetch roles to skip admins/managers
        const { data: players } = await supabase
            .from('profiles')
            .select('id, role')
            .in('id', playerIds)
        const studentIds = players?.filter(p => p.role === 'student').map(p => p.id) || []

        if (studentIds.length > 0) {
            const violations = studentIds.map(studentId => ({
                student_id: studentId,
                booking_id: bookingId,
                violation_type: 'booking_timeout',
                severity: 'minor',
                reason: 'Booking was not approved within 10 minutes of start time and was auto-cancelled.',
            }))
            await supabase.from('student_violations').insert(violations)
        }
    }

    revalidatePath('/manager')
    revalidatePath('/admin/defaulters')
    revalidatePath('/student/profile')
    return { success: true }
}
