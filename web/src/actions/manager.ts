'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

import { startOfDay, endOfDay } from 'date-fns'

export async function getCurrentBookings() {
    const supabase = await createClient()
    const now = new Date()
    const endOfToday = endOfDay(now)

    // 1. Fetch bookings for today that haven't ended yet
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
            *,
            profiles:user_id (full_name, role),
            courts (name, sport)
        `)
        .in('status', ['pending_confirmation', 'confirmed', 'waiting_manager', 'active'])
        .gte('end_time', now.toISOString())
        .lte('start_time', endOfToday.toISOString())
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

    // ALSO fetch courts that have an ACTIVE maintenance booking right now
    const now = new Date()
    const { data: maintenanceBookings } = await supabase
        .from('bookings')
        .select(`
            court_id,
            courts (id, name, sport)
        `)
        .eq('is_maintenance', true)
        .eq('status', 'confirmed') // Maintenance bookings are auto-confirmed
        .lte('start_time', now.toISOString())
        .gte('end_time', now.toISOString())

    const maintenanceBookingCourts = maintenanceBookings?.map((b: any) => ({
        id: b.courts.id,
        name: b.courts.name,
        sport: b.courts.sport,
        maintenance_notes: 'Scheduled Maintenance (Blocked Slot)',
        is_active: true // They might be technically active but blocked by booking
    })) || []

    // Merge lists, removing duplicates by ID
    const allMaintenance = [...disabledCourts, ...maintenanceBookingCourts]
    const uniqueMaintenance = Array.from(new Map(allMaintenance.map(item => [item.id, item])).values())

    return uniqueMaintenance
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

    const playerIds = Array.isArray(booking.players_list) ? booking.players_list : []

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
