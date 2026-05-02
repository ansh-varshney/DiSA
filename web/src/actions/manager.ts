'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendNotification, sendNotifications, notifyAdmins } from '@/actions/notifications'

// ─── Role guard ───────────────────────────────────────────────────────────────

async function requireManagerRole(): Promise<
    { user: any; supabase: any; error: null } | { user: null; supabase: null; error: string }
> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { user: null, supabase: null, error: 'Unauthorized' }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['manager', 'admin', 'superuser'].includes(profile.role)) {
        return { user: null, supabase: null, error: 'Forbidden' }
    }

    return { user, supabase, error: null }
}

// ─── Point deltas by event ────────────────────────────────────────────────────
const REJECTION_POINTS: Record<string, number> = {
    students_late: -6,
    inappropriate_behaviour: -8,
    improper_gear: -4,
    other: 0,
}

const POST_SESSION_POINTS: Record<string, number> = {
    late_end: -4,
    inappropriate_behaviour: -8,
    vandalism: -15,
    other: 0,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return all confirmed student IDs (booker + confirmed players_list entries) for a booking.
 *  Entries with no status field are treated as confirmed for backward compatibility. */
async function getBookingStudentIds(
    adminSupabase: ReturnType<typeof createAdminClient>,
    bookingId: string
): Promise<string[]> {
    const { data: booking } = await adminSupabase
        .from('bookings')
        .select('user_id, players_list')
        .eq('id', bookingId)
        .single()

    if (!booking) return []

    const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
    const extraIds = playersList
        .filter((p: any) => !p.status || p.status === 'confirmed') // confirmed or legacy
        .map((p: any) => (typeof p === 'string' ? p : p?.id))
        .filter(Boolean)

    const allIds = [...new Set([booking.user_id, ...extraIds])]

    const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id')
        .in('id', allIds)
        .eq('role', 'student')

    return (profiles || []).map((p: any) => p.id)
}

/** Fetch booking with court info for notification bodies. */
async function getBookingForNotif(
    adminSupabase: ReturnType<typeof createAdminClient>,
    bookingId: string
) {
    const { data } = await adminSupabase
        .from('bookings')
        .select('id, start_time, user_id, courts(name, sport)')
        .eq('id', bookingId)
        .single()
    return data
}

/** Atomically add `delta` to each student's points (via DB RPC). */
async function applyPoints(
    adminSupabase: ReturnType<typeof createAdminClient>,
    studentIds: string[],
    delta: number
): Promise<void> {
    if (studentIds.length === 0 || delta === 0) return
    await Promise.all(
        studentIds.map((id) =>
            adminSupabase.rpc('update_student_points', { p_student_id: id, p_delta: delta })
        )
    )
}

export async function getCurrentBookings() {
    const supabase = await createClient()
    const now = new Date()
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    // 1. Fetch bookings for today
    //    - Active bookings show if end_time is within the last 1 hour (manager can still end them)
    //    - Non-active bookings show only if end_time is still in the future
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(
            `
            *,
            profiles:user_id (full_name, role),
            courts (name, sport)
        `
        )
        .in('status', ['pending_confirmation', 'confirmed', 'waiting_manager', 'active'])
        .lte('start_time', next24h.toISOString())
        .or(
            `and(status.eq.active,end_time.gte.${oneHourAgo.toISOString()}),end_time.gte.${now.toISOString()}`
        )
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching current bookings:', error)
        return []
    }

    if (!bookings || bookings.length === 0) return []

    // 2. Extract all unique equipment IDs
    const allEquipmentIds = Array.from(new Set(bookings.flatMap((b: any) => b.equipment_ids || [])))

    // 3. Fetch equipment details if any exist
    const equipmentMap = new Map()
    if (allEquipmentIds.length > 0) {
        const { data: equipmentList } = await supabase
            .from('equipment')
            .select('id, name')
            .in('id', allEquipmentIds)

        if (equipmentList) {
            equipmentList.forEach((eq: any) => equipmentMap.set(eq.id, eq.name))
        }
    }

    // 4. Attach equipment names to bookings
    return bookings.map((booking: any) => ({
        ...booking,
        equipment_names: (booking.equipment_ids || [])
            .map((id: string) => equipmentMap.get(id))
            .filter(Boolean),
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
    const disabledCourts = data.filter(
        (court: any) =>
            !court.is_active || (court.maintenance_notes && court.maintenance_notes.trim() !== '')
    )

    // ALSO fetch courts with maintenance bookings for the ENTIRE DAY (not just right now)
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const { data: maintenanceBookings } = await supabase
        .from('bookings')
        .select(
            `
            id,
            court_id,
            start_time,
            end_time,
            courts (id, name, sport)
        `
        )
        .eq('is_maintenance', true)
        .not('status', 'eq', 'cancelled')
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true })

    // Build a list of maintenance slots (court + time window)
    const maintenanceBookingCourts =
        maintenanceBookings?.map((b: any) => ({
            id: b.id, // Use booking ID as key to allow multiple slots per court
            court_id: b.courts.id,
            name: b.courts.name,
            sport: b.courts.sport,
            maintenance_notes: 'Scheduled Maintenance',
            start_time: b.start_time,
            end_time: b.end_time,
            is_active: true,
            is_booking_slot: true,
        })) || []

    // For courts that are permanently disabled, mark them differently
    const formattedDisabledCourts = disabledCourts.map((c: any) => ({
        ...c,
        is_booking_slot: false,
    }))

    // Combine: permanently disabled courts + today's maintenance booking slots
    return [...formattedDisabledCourts, ...maintenanceBookingCourts]
}

// Keep existing getPendingBookings for now as it might be used elsewhere or reference
export async function getPendingBookings() {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('bookings')
        .select(
            `
            *,
            profiles:user_id (full_name, phone_number, student_id),
            courts (name, sport)
        `
        )
        .eq('status', 'pending_confirmation')
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error getting pending bookings:', error)
        return []
    }
    return data
}

export async function updateBookingStatus(
    bookingId: string,
    status: 'confirmed' | 'rejected' | 'active' | 'completed' | 'cancelled'
) {
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

    // Update booking status; guard against overwriting terminal states (e.g. race with lazy expiry)
    const updateQuery = supabase.from('bookings').update({ status }).eq('id', bookingId)
    const { error } = await (status === 'active'
        ? updateQuery.not('status', 'in', '("cancelled","completed","rejected")')
        : updateQuery)

    if (error) {
        return { error: error.message }
    }

    // Free equipment if terminal status
    if (equipmentIds.length > 0) {
        await supabase.from('equipment').update({ is_available: true }).in('id', equipmentIds)
    }

    // N5 — when session goes active, notify all confirmed players to report to the court
    if (status === 'active') {
        const adminSupabase = createAdminClient()
        const bk = await getBookingForNotif(adminSupabase, bookingId)
        if (bk) {
            const studentIds = await getBookingStudentIds(adminSupabase, bookingId)
            const court = (bk as any).courts
            const startDisplay = new Date(bk.start_time).toLocaleString('en-IN', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
            await sendNotifications(
                studentIds.map((id) => ({
                    recipientId: id,
                    type: 'booking_session_active',
                    title: 'Session Active — Report to Court',
                    body: `Your ${court?.sport || ''} session at ${court?.name || 'the court'} is now active (${startDisplay}). Head over now!`,
                    data: { booking_id: bookingId, court_name: court?.name, sport: court?.sport },
                }))
            )
        }
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
        .select(
            `
            *,
            profiles:user_id (*),
            courts (*)
        `
        )
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
        // Free equipment so it becomes bookable again
        await freeBookingEquipment(supabase, bookingId)

        // Auto-cancel
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)

        booking.status = 'cancelled'

        // Issue violations + N7 — same as expireBooking timeout path
        const rawList = Array.isArray(booking.players_list) ? booking.players_list : []
        const allPlayerIds = [
            booking.user_id,
            ...rawList.map((p: any) => (typeof p === 'string' ? p : p?.id)).filter(Boolean),
        ] as string[]

        if (allPlayerIds.length > 0) {
            const { data: playerRows } = await supabase
                .from('profiles')
                .select('id, role')
                .in('id', allPlayerIds)
            const expiredStudentIds = (playerRows || [])
                .filter((p: any) => p.role === 'student')
                .map((p: any) => p.id)

            if (expiredStudentIds.length > 0) {
                const adminSupabaseExp = createAdminClient()
                await adminSupabaseExp.from('student_violations').insert(
                    expiredStudentIds.map((id: string) => ({
                        student_id: id,
                        booking_id: bookingId,
                        violation_type: 'booking_timeout',
                        severity: 'minor',
                        reason: 'Booking was not approved within 10 minutes of start time and was auto-cancelled.',
                    }))
                )
                await applyPoints(adminSupabaseExp, expiredStudentIds, -8)
                const bkNotif = await getBookingForNotif(adminSupabaseExp, bookingId)
                if (bkNotif) {
                    const court = (bkNotif as any).courts
                    await sendNotifications(
                        expiredStudentIds.map((id: string) => ({
                            recipientId: id,
                            type: 'booking_expired',
                            title: 'Booking Expired — No-Show',
                            body: `Your ${court?.sport || ''} booking at ${court?.name || 'court'} was auto-cancelled (no manager approval within 10 minutes). −8 pts.`,
                            data: { booking_id: bookingId, points_delta: -8 },
                        }))
                    )
                }
            }
        }
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
    const allPlayers: any[] = []

    // Always include the main booker (User)
    allPlayers.push({
        ...booking.profiles,
        is_booker: true,
    })

    const rawPlayersList = Array.isArray(booking.players_list) ? booking.players_list : []

    // Handle both formats: array of UUID strings OR array of {id, full_name, ...} objects
    const playerIds = rawPlayersList
        .map((entry: any) => (typeof entry === 'string' ? entry : entry?.id))
        .filter(Boolean)

    // Filter out the booker ID if it happens to be in the list to avoid duplicates
    const additionalPlayerIds = playerIds.filter((id: string) => id !== booking.profiles.id)

    if (additionalPlayerIds.length > 0) {
        const { data: extraPlayers } = await supabase
            .from('profiles')
            .select('*')
            .in('id', additionalPlayerIds)

        if (extraPlayers) {
            allPlayers.push(...extraPlayers.map((p: any) => ({ ...p, is_booker: false })))
        }
    }

    return {
        ...booking,
        equipment: equipmentList,
        all_players: allPlayers,
    }
}

export async function rejectWithReason(
    bookingId: string,
    reason: string,
    customReason: string | null,
    playerIds: string[]
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const { supabase } = auth

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
        await supabase.from('equipment').update({ is_available: true }).in('id', equipmentIds)
    }

    // 2. Issue warnings to all student players (skip admins/managers/superusers)
    // Fetch player roles to avoid warning admins
    const { data: players } = await supabase.from('profiles').select('id, role').in('id', playerIds)

    const studentIds: string[] =
        players
            ?.filter((p: { id: string; role: string }) => p.role === 'student')
            .map((p: { id: string; role: string }) => p.id) || []

    // adminSupabase is needed for points/ban RPCs and for N6 notification lookup
    const adminSupabase = createAdminClient()

    if (studentIds.length > 0) {
        // Insert a violation record for each student
        const violations = studentIds.map((studentId) => ({
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

        // Deduct points for all involved students
        const pointsDelta = REJECTION_POINTS[reason] ?? 0
        if (pointsDelta !== 0) {
            await applyPoints(adminSupabase, studentIds, pointsDelta)
        }

        // If late arrival, check whether any student now has 3+ strikes → 14-day ban + N16
        // This runs independently of whether points were deducted, so a future change to the
        // points delta for 'students_late' will not accidentally disable the ban.
        if (reason === 'students_late') {
            const banResults = await Promise.all(
                studentIds.map(async (id) => {
                    // RPC now returns the actual banned_until timestamp (or null if no ban)
                    const { data: banned_until } = await adminSupabase.rpc(
                        'check_and_apply_late_ban',
                        { p_student_id: id }
                    )
                    return { id, banned_until: banned_until as string | null }
                })
            )
            const bannedResults = banResults.filter((r) => r.banned_until != null)
            if (bannedResults.length > 0) {
                await sendNotifications(
                    bannedResults.map(({ id, banned_until }) => {
                        // Use the authoritative DB timestamp — not a locally-computed one
                        const banDateStr = new Date(banned_until!).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                        })
                        return {
                            recipientId: id,
                            type: 'ban_applied',
                            title: '14-Day Booking Ban Applied',
                            body: `You have accumulated 3 late-arrival violations. Booking is suspended until ${banDateStr}. Contact admin for early clearance.`,
                            data: { banned_until },
                        }
                    })
                )
            }
        }
    }

    // N6 — notify student players of rejection regardless of whether violations were issued
    const bk = await getBookingForNotif(adminSupabase, bookingId)
    if (bk && studentIds.length > 0) {
        const court = (bk as any).courts
        const startDisplay = new Date(bk.start_time).toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        const reasonLabel = reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        await sendNotifications(
            studentIds.map((id) => ({
                recipientId: id,
                type: 'booking_rejected',
                title: 'Booking Rejected',
                body: `Your ${court?.sport || ''} booking at ${court?.name || 'court'} on ${startDisplay} was rejected. Reason: ${customReason || reasonLabel}.`,
                data: { booking_id: bookingId, reason, court_name: court?.name },
            }))
        )
    }

    revalidatePath('/manager')
    revalidatePath('/admin/reservations')
    revalidatePath('/admin/defaulters')
    revalidatePath('/student')
    revalidatePath('/student/profile')
    return { success: true }
}

// ─── Helper: free equipment for a booking ────────────────────────────────────
async function freeBookingEquipment(supabase: any, bookingId: string) {
    const { data: booking } = await supabase
        .from('bookings')
        .select('equipment_ids')
        .eq('id', bookingId)
        .single()

    const equipmentIds: string[] = booking?.equipment_ids || []
    if (equipmentIds.length > 0) {
        await supabase.from('equipment').update({ is_available: true }).in('id', equipmentIds)
    }
    return equipmentIds
}

// ─── Emergency End Session ────────────────────────────────────────────────────
export async function emergencyEndSession(bookingId: string, reason: string) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const { user, supabase } = auth

    // 1. Free equipment
    await freeBookingEquipment(supabase, bookingId)

    // 2. Mark booking completed
    const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', bookingId)
    if (bookingError) return { error: bookingError.message }

    // 3. Create a feedback_complaint entry with category = emergency_by_manager
    await supabase.from('feedback_complaints').insert({
        student_id: user.id, // manager who filed it
        booking_id: bookingId,
        title: 'Emergency Session End',
        description: reason,
        category: 'emergency_by_manager',
        status: 'open',
    })

    // N11 — notify all confirmed players session ended early
    const adminSupabase2 = createAdminClient()
    const studentIds2 = await getBookingStudentIds(adminSupabase2, bookingId)
    const bk2 = await getBookingForNotif(adminSupabase2, bookingId)
    if (bk2) {
        const court2 = (bk2 as any).courts
        if (studentIds2.length > 0) {
            await sendNotifications(
                studentIds2.map((id) => ({
                    recipientId: id,
                    type: 'session_ended_emergency',
                    title: 'Session Ended Early',
                    body: `Your ${court2?.sport || ''} session at ${court2?.name || 'court'} was ended early by the manager. Reason: ${reason}.`,
                    data: { booking_id: bookingId, reason },
                }))
            )
        }
        // Always notify admins of emergency end, regardless of student count
        await notifyAdmins({
            type: 'emergency_alert',
            title: 'Emergency Session End',
            body: `Manager ended a ${court2?.sport || ''} session early at ${court2?.name || 'court'}. Reason: ${reason}.`,
            data: { booking_id: bookingId, reason },
        })
    }

    revalidatePath('/manager')
    revalidatePath('/admin/feedback')
    revalidatePath('/admin/reservations')
    return { success: true }
}

// ─── Update Equipment Conditions ──────────────────────────────────────────────
// (Usage count increment is handled inside endSession for correctness)
export async function updateEquipmentConditions(
    conditions: { id: string; condition: 'good' | 'minor_damage' | 'damaged' }[]
) {
    const supabase = await createClient()

    await Promise.all(
        conditions.map(({ id, condition }) =>
            supabase.from('equipment').update({ condition }).eq('id', id)
        )
    )

    return { success: true }
}

// ─── Report Lost Equipment ────────────────────────────────────────────────────
export async function reportLostEquipment(
    bookingId: string,
    equipmentIds: string[],
    playerIds: string[]
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const { user, supabase } = auth

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

    const impactedBookings = (futureBookings || []).filter(
        (b: any) =>
            Array.isArray(b.equipment_ids) &&
            b.equipment_ids.some((eid: string) => equipmentIds.includes(eid))
    )

    // Remove lost equipment from impacted bookings (keep the booking itself)
    for (const b of impactedBookings) {
        const updatedIds = (b.equipment_ids as string[]).filter(
            (eid: string) => !equipmentIds.includes(eid)
        )
        await supabase.from('bookings').update({ equipment_ids: updatedIds }).eq('id', b.id)
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
        const { error: violationError, data: violationData } = await supabase
            .from('student_violations')
            .insert(violations)
            .select()
        console.log('Violation insert result:', violationData)
        console.log('Violation insert error:', violationError)

        // Deduct -20 points from all involved students
        const adminSupabase = createAdminClient()
        const { data: studentProfiles } = await adminSupabase
            .from('profiles')
            .select('id')
            .in('id', playerIds)
            .eq('role', 'student')
        const studentIds = (studentProfiles || []).map((p: any) => p.id)
        await applyPoints(adminSupabase, studentIds, -20)

        // N14 — notify all players of equipment loss
        if (studentIds.length > 0) {
            await sendNotifications(
                studentIds.map((id: string) => ({
                    recipientId: id,
                    type: 'equipment_lost',
                    title: 'Equipment Lost — Severe Violation',
                    body: `Equipment lost during your booking (${names}) has been reported. −20 pts. This has been flagged to admin.`,
                    data: { booking_id: bookingId, equipment: names, points_delta: -20 },
                }))
            )
        }
        // N21 — notify admins
        await notifyAdmins({
            type: 'equipment_incident',
            title: 'Equipment Reported Lost',
            body: `Equipment reported lost: ${names}. All players have been penalised (−20 pts each).`,
            data: { booking_id: bookingId, equipment: names },
        })
    } else {
        console.warn('reportLostEquipment: No players provided')
    }

    revalidatePath('/admin/defaulters')
    revalidatePath('/admin/equipment')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    revalidatePath('/student/profile')
    return { success: true, impactedBookingsCount: impactedBookings.length }
}

// ─── Report Student Post-Session ──────────────────────────────────────────────
export async function reportStudentPostSession(
    bookingId: string,
    studentId: string,
    reason: string,
    customReason: string | null
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const { supabase } = auth

    // Ensure the target is a student before issuing any violation
    const adminSupabase = createAdminClient()
    const { data: profile } = await adminSupabase
        .from('profiles')
        .select('role')
        .eq('id', studentId)
        .single()
    if (!profile || profile.role !== 'student') return { error: 'Target user is not a student' }

    // Issue violation warning
    await supabase.from('student_violations').insert({
        student_id: studentId,
        booking_id: bookingId,
        violation_type: reason,
        severity: 'minor',
        reason: customReason || reason,
    })

    // Deduct points for this specific student
    const pointsDelta = POST_SESSION_POINTS[reason] ?? 0
    if (pointsDelta !== 0) {
        await applyPoints(adminSupabase, [studentId], pointsDelta)
    }

    // N13 — notify the reported student
    const reasonLabel = reason.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    const ptMsg = pointsDelta !== 0 ? ` Points: ${pointsDelta > 0 ? '+' : ''}${pointsDelta}.` : ''
    await sendNotification({
        recipientId: studentId,
        type: 'violation_issued',
        title: 'Post-Session Violation',
        body: `A violation was issued against you: ${customReason || reasonLabel}.${ptMsg}`,
        data: { booking_id: bookingId, violation_type: reason, points_delta: pointsDelta },
    })

    revalidatePath('/admin/defaulters')
    revalidatePath('/student/profile')
    return { success: true }
}

// ─── End Session (normal end) ─────────────────────────────────────────────────
export async function endSession(
    bookingId: string,
    equipmentConditions: { id: string; condition: 'good' | 'minor_damage' | 'damaged' }[]
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const { supabase } = auth

    // Atomically mark as completed — if 0 rows affected the booking was already completed
    // (prevents concurrent double-award when two manager calls race past a non-atomic status read).
    const { data: markedRows } = await supabase
        .from('bookings')
        .update({ status: 'completed' })
        .eq('id', bookingId)
        .neq('status', 'completed')
        .select('id')

    if (!markedRows || markedRows.length === 0) return { already_handled: true }

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
                total_usage_count: (equip?.total_usage_count || 0) + 1,
            })
            .eq('id', id)
    }

    // If no items had conditions specified, still free by booking
    if (equipmentConditions.length === 0) {
        await freeBookingEquipment(supabase, bookingId)
    }

    // 3. Award points to all players
    //    Base: +8 for completing the session
    //    Equipment bonus/penalty (worst condition across all items):
    //      all good      → +2
    //      any minor_dmg → -1
    //      any damaged   → -8
    const adminSupabase = createAdminClient()
    const studentIds = await getBookingStudentIds(adminSupabase, bookingId)
    if (studentIds.length > 0) {
        let delta = 8 // base
        if (equipmentConditions.length > 0) {
            const hasDamaged = equipmentConditions.some((e) => e.condition === 'damaged')
            const hasMinorDmg = equipmentConditions.some((e) => e.condition === 'minor_damage')
            if (hasDamaged) delta += -8
            else if (hasMinorDmg) delta += -1
            else delta += 2 // all good
        }
        await applyPoints(adminSupabase, studentIds, delta)
    }

    // N10 — notify all confirmed players session ended normally (include points earned)
    if (studentIds.length > 0) {
        const bkN10 = await getBookingForNotif(adminSupabase, bookingId)
        if (bkN10) {
            const court = (bkN10 as any).courts
            // Determine equipment condition delta for message
            const hasDamaged = equipmentConditions.some((e) => e.condition === 'damaged')
            const hasMinorDmg = equipmentConditions.some((e) => e.condition === 'minor_damage')
            const equipDelta = hasDamaged
                ? -8
                : hasMinorDmg
                  ? -1
                  : equipmentConditions.length > 0
                    ? 2
                    : 0
            const totalDelta = 8 + equipDelta
            const pointsMsg = totalDelta >= 0 ? `+${totalDelta} pts` : `${totalDelta} pts`
            await sendNotifications(
                studentIds.map((id) => ({
                    recipientId: id,
                    type: 'session_ended',
                    title: 'Session Completed',
                    body: `Your ${court?.sport || ''} session at ${court?.name || 'court'} ended. Points: ${pointsMsg}.`,
                    data: { booking_id: bookingId, points_delta: totalDelta },
                }))
            )
        }
    }

    revalidatePath('/manager')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    revalidatePath('/student/profile')
    return { success: true }
}

// ─── Expire Booking (10-min timeout) ──────────────────────────────────────────
// Called from manager-approval-screen when booking isn't accepted within 10 mins.
// Cancels booking, frees equipment, issues violations to all players.
export async function expireBooking(bookingId: string, playerIds: string[]) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const { supabase } = auth

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
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)

    // 4. Issue violations to all involved students (filter out non-students)
    if (playerIds.length > 0) {
        // Fetch roles to skip admins/managers
        const { data: players } = await supabase
            .from('profiles')
            .select('id, role')
            .in('id', playerIds)
        const studentIds: string[] =
            players
                ?.filter((p: { id: string; role: string }) => p.role === 'student')
                .map((p: { id: string; role: string }) => p.id) || []

        if (studentIds.length > 0) {
            const violations = studentIds.map((studentId) => ({
                student_id: studentId,
                booking_id: bookingId,
                violation_type: 'booking_timeout',
                severity: 'minor',
                reason: 'Booking was not approved within 10 minutes of start time and was auto-cancelled.',
            }))
            await supabase.from('student_violations').insert(violations)

            // Deduct -8 points for no-show / timeout
            const adminSupabase = createAdminClient()
            await applyPoints(adminSupabase, studentIds, -8)

            // N7 — notify all players of auto-expiry
            const bkExp = await getBookingForNotif(adminSupabase, bookingId)
            if (bkExp) {
                const court = (bkExp as any).courts
                await sendNotifications(
                    studentIds.map((id) => ({
                        recipientId: id,
                        type: 'booking_expired',
                        title: 'Booking Expired — No-Show',
                        body: `Your ${court?.sport || ''} booking at ${court?.name || 'court'} was auto-cancelled (no manager approval within 10 minutes). −8 pts.`,
                        data: { booking_id: bookingId, points_delta: -8 },
                    }))
                )
            }
        }
    }

    revalidatePath('/manager')
    revalidatePath('/admin/defaulters')
    revalidatePath('/student/profile')
    return { success: true }
}
