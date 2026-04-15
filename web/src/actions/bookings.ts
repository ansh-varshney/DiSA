'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { addMinutes } from 'date-fns'
import { getPlayerLimits } from '@/lib/sport-config'
import { sendNotification, sendNotifications, notifyManagers, notifyAdminsAndManagers } from '@/actions/notifications'

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
    const reservedIds = new Set<string>()

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

    // 2a. Check if student has an active time-ban (3 late arrivals → 14-day ban)
    const { data: profileData } = await supabase
        .from('profiles')
        .select('banned_until, priority_booking_remaining')
        .eq('id', user.id)
        .single()

    if (profileData?.banned_until && new Date(profileData.banned_until) > new Date()) {
        const banDate = new Date(profileData.banned_until).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
        })
        return { error: `You are temporarily banned until ${banDate} due to repeated late arrivals. Contact admin for early clearance.` }
    }

    // 2b. Check if student is suspended (3+ violations)
    const { count: violationCount } = await supabase
        .from('student_violations')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)

    if (violationCount && violationCount >= 3) {
        return { error: 'Your account has been suspended due to 3 or more violations. Contact admin.' }
    }

    // 2c. Duration validation — only 30 or 60 min allowed normally;
    //     90 min requires an unused monthly priority booking reward.
    if (duration === 90) {
        if ((profileData?.priority_booking_remaining ?? 0) <= 0) {
            return { error: 'You do not have a priority booking slot available. Only 30 or 60 minute bookings are allowed.' }
        }
    } else if (duration !== 30 && duration !== 60) {
        return { error: 'Invalid booking duration. Please select 30 or 60 minutes.' }
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
    const rawPlayersList: { id: string; full_name?: string; [key: string]: unknown }[] =
        playersListStr ? JSON.parse(playersListStr) : []

    // Enrich players_list with branch, gender, year from their profiles
    // so historical analytics don't break when profiles change later.
    let playersList = rawPlayersList
    if (rawPlayersList.length > 0) {
        const playerIds = rawPlayersList.map((p) => p.id).filter(Boolean)
        const { data: playerProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, branch, gender, year')
            .in('id', playerIds)

        if (playerProfiles) {
            const profileMap = Object.fromEntries(playerProfiles.map((p) => [p.id, p]))
            playersList = rawPlayersList.map((p) => ({
                ...p,
                branch: profileMap[p.id]?.branch ?? p.branch ?? null,
                gender: profileMap[p.id]?.gender ?? p.gender ?? null,
                year: profileMap[p.id]?.year ?? (p.year as string | null) ?? null,
                full_name: profileMap[p.id]?.full_name ?? p.full_name ?? null,
                // Players start as 'pending' — confirmed only after they accept play request
                status: 'pending',
            }))
        }
    }

    // 4b. Validate player count against sport limits
    const { data: court } = await supabase
        .from('courts')
        .select('sport, name')
        .eq('id', courtId)
        .single()

    if (court) {
        const limits = getPlayerLimits(court.sport)
        if (numPlayers < limits.min) {
            return { error: `Minimum ${limits.min} players required for ${court.sport}` }
        }
        if (limits.max && numPlayers > limits.max) {
            return { error: `Maximum ${limits.max} players allowed for ${court.sport}` }
        }
    }

    // 5. Mark equipment as unavailable using optimistic locking.
    //    Only rows still available (is_available = true) are updated.
    //    If fewer rows come back than requested, another concurrent booking
    //    grabbed one — abort immediately before the booking is inserted.
    if (equipmentIds.length > 0) {
        const { data: locked, error: lockError } = await supabase
            .from('equipment')
            .update({ is_available: false })
            .in('id', equipmentIds)
            .eq('is_available', true)
            .select('id')

        if (lockError || !locked || locked.length < equipmentIds.length) {
            // Free any items that were locked before we found out one was gone
            if (locked && locked.length > 0) {
                await supabase
                    .from('equipment')
                    .update({ is_available: true })
                    .in('id', locked.map((e: any) => e.id))
            }
            return { error: 'One or more equipment items are no longer available. Please refresh and try again.' }
        }
    }

    // 6. Insert Booking — fetch the new id for play requests
    const { data: newBooking, error } = await supabase
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
        .select('id')
        .single()

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

    // 7. Send play requests + notifications to each invited player (non-booker)
    if (rawPlayersList.length > 0 && newBooking?.id) {
        const adminSupabase = createAdminClient()
        const courtName = (court as any)?.name || 'Court'
        const sport = (court as any)?.sport || ''
        const startDisplay = startTime.toLocaleString('en-IN', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })

        // Fetch booker name for notification body
        const { data: bookerProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
        const bookerName = bookerProfile?.full_name || 'Someone'

        for (const player of rawPlayersList) {
            // Create notification first to get its id
            const notifId = await sendNotification({
                recipientId: player.id,
                senderId: user.id,
                type: 'play_request_received',
                title: 'Play Request',
                body: `${bookerName} invited you to play ${sport} at ${courtName} on ${startDisplay}. Accept or decline below.`,
                data: {
                    booking_id: newBooking.id,
                    court_name: courtName,
                    sport,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                    booker_name: bookerName,
                },
            })

            // Create play_request record linked to that notification
            await adminSupabase.from('play_requests').insert({
                booking_id: newBooking.id,
                requester_id: user.id,
                recipient_id: player.id,
                status: 'pending',
                notification_id: notifId,
            })
        }

        // 8. Notify managers of new booking — N19
        const { data: bookerFull } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()

        await notifyManagers({
            senderId: user.id,
            type: 'new_booking',
            title: 'New Booking',
            body: `${bookerFull?.full_name || 'A student'} booked ${courtName} (${sport}) for ${startDisplay}.`,
            data: {
                booking_id: newBooking.id,
                court_name: courtName,
                sport,
                start_time: startTime.toISOString(),
                booker_name: bookerFull?.full_name,
            },
        })
    }

    // If this was a 90-min priority booking, consume the one-time slot and notify the student
    if (duration === 90 && newBooking?.id) {
        const adminSupabasePriority = createAdminClient()
        await adminSupabasePriority
            .from('profiles')
            .update({ priority_booking_remaining: 0 })
            .eq('id', user.id)

        await sendNotification({
            recipientId: user.id,
            type: 'priority_booking_used',
            title: 'Priority Booking Slot Used',
            body: 'You have used your monthly 90-minute priority booking. Your bookings now return to the standard 30 or 60-minute options.',
            data: { booking_id: newBooking.id },
        })
    }

    revalidatePath('/student/book')
    revalidatePath('/student/reservations')
    revalidatePath('/student/profile')
    return { success: true }
}

export async function cancelBooking(bookingId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch booking to verify ownership and get equipment
    const { data: booking } = await supabase
        .from('bookings')
        .select('user_id, status, equipment_ids, start_time, players_list, courts(name, sport)')
        .eq('id', bookingId)
        .single()

    if (!booking) return { error: 'Booking not found' }
    if (booking.user_id !== user.id) return { error: 'Not your booking' }
    if (!['pending_confirmation', 'confirmed', 'waiting_manager'].includes(booking.status)) {
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

    // Deduct -3 points if cancellation is less than 3 hours before start
    const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
    if (new Date(booking.start_time) < threeHoursFromNow) {
        const adminSupabase = createAdminClient()
        await adminSupabase.rpc('update_student_points', { p_student_id: user.id, p_delta: -3 })
    }

    const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)

    if (error) return { error: error.message }

    // N8 — notify confirmed players only (pending players have not committed, do not notify)
    const courtInfo = (booking as any).courts
    const playersList = Array.isArray((booking as any).players_list) ? (booking as any).players_list : []
    const confirmedPlayerIds = playersList
        .filter((p: any) => p.status === 'confirmed')
        .map((p: any) => (typeof p === 'string' ? p : p.id))
        .filter((id: string) => id !== user.id)

    if (confirmedPlayerIds.length > 0) {
        const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
        await sendNotifications(
            confirmedPlayerIds.map((pid: string) => ({
                recipientId: pid,
                senderId: user.id,
                type: 'booking_cancelled_by_booker',
                title: 'Booking Cancelled',
                body: `Your booking for ${courtInfo?.name || 'a court'} (${courtInfo?.sport || ''}) on ${startDisplay} has been cancelled by the booker.`,
                data: { booking_id: bookingId },
            })),
        )
    }

    revalidatePath('/student/reservations')
    revalidatePath('/student')
    revalidatePath('/student/profile')
    return { success: true }
}

export async function withdrawFromBooking(bookingId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // Fetch the booking with court sport info
    const { data: booking } = await supabase
        .from('bookings')
        .select('user_id, status, players_list, num_players, equipment_ids, start_time, courts(sport, name)')
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

    // Check if withdrawal drops below minimum players
    const sport = (booking as any).courts?.sport || ''
    const limits = getPlayerLimits(sport)

    if (newNumPlayers < limits.min) {
        // Auto-cancel the booking since it no longer meets minimum
        const equipmentIds: string[] = booking.equipment_ids || []
        if (equipmentIds.length > 0) {
            await supabase
                .from('equipment')
                .update({ is_available: true })
                .in('id', equipmentIds)
        }

        await supabase
            .from('bookings')
            .update({ status: 'cancelled' })
            .eq('id', bookingId)

        // Notify the booker and any remaining confirmed players about the auto-cancellation
        const courtInfo = (booking as any).courts
        const startDisplay = new Date((booking as any).start_time).toLocaleString('en-IN', {
            weekday: 'short', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
        const cancelBody = `Your booking for ${courtInfo?.name || 'a court'} on ${startDisplay} was automatically cancelled because the player count dropped below the minimum required (${limits.min}).`

        const notifyIds = new Set<string>()
        notifyIds.add(booking.user_id)
        for (const p of updatedPlayersList) {
            const pid = typeof p === 'string' ? p : p.id
            const status = typeof p === 'string' ? undefined : p.status
            if (!status || status === 'confirmed') notifyIds.add(pid)
        }
        notifyIds.delete(user.id) // withdrawing player already knows

        const notifications = Array.from(notifyIds).map(pid => ({
            recipientId: pid,
            senderId: user.id,
            type: 'booking_auto_cancelled',
            title: 'Booking Auto-Cancelled',
            body: cancelBody,
            data: { booking_id: bookingId },
        }))

        if (notifications.length > 0) {
            await sendNotifications(notifications)
        }

        revalidatePath('/student/reservations')
        revalidatePath('/student')
        revalidatePath('/student/book')
        revalidatePath('/manager')
        revalidatePath('/admin/reservations')
        return { success: true, cancelled: true, reason: `Booking cancelled: player count dropped below minimum (${limits.min})` }
    }

    const { error } = await supabase
        .from('bookings')
        .update({
            players_list: updatedPlayersList,
            num_players: newNumPlayers,
        })
        .eq('id', bookingId)

    if (error) return { error: error.message }

    // N9 — notify the booker that a player withdrew
    const { data: withdrawerProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

    const courtInfo = (booking as any).courts
    const startDisplay = new Date((booking as any).start_time).toLocaleString('en-IN', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })
    await sendNotification({
        recipientId: booking.user_id,
        senderId: user.id,
        type: 'player_withdrew',
        title: 'Player Withdrew',
        body: `${withdrawerProfile?.full_name || 'A player'} withdrew from your ${courtInfo?.sport || ''} booking at ${courtInfo?.name || 'court'} on ${startDisplay}.`,
        data: { booking_id: bookingId },
    })

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
        ['pending_confirmation', 'confirmed', 'waiting_manager'].includes(b.status) &&
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

// ─── Student Start Play ───────────────────────────────────────────────────────
// Called when a student arrives at the court and taps "Start Play".
// Transitions the booking from 'confirmed' → 'waiting_manager' and notifies
// all managers so they can head over and approve the session.
export async function studentStartPlay(bookingId: string) {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: booking } = await supabase
        .from('bookings')
        .select('user_id, status, start_time, courts(name, sport)')
        .eq('id', bookingId)
        .single()

    if (!booking) return { error: 'Booking not found' }
    if (booking.user_id !== user.id) return { error: 'Not your booking' }
    if (booking.status !== 'confirmed') {
        return { error: 'Booking cannot be started in its current state' }
    }

    const { error } = await supabase
        .from('bookings')
        .update({ status: 'waiting_manager' })
        .eq('id', bookingId)

    if (error) return { error: error.message }

    const courtInfo = (booking as any).courts
    const startDisplay = new Date((booking as any).start_time).toLocaleString('en-IN', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    await notifyManagers({
        senderId: user.id,
        type: 'student_ready_to_play',
        title: 'Student Ready to Play',
        body: `A student is ready to play ${courtInfo?.sport || ''} at ${courtInfo?.name || 'court'} (${startDisplay}). Please verify and approve.`,
        data: { booking_id: bookingId },
    })

    revalidatePath('/student/reservations')
    revalidatePath('/manager/approvals')
    return { success: true }
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

    await notifyAdminsAndManagers({
        senderId: user.id,
        type: 'student_emergency_alert',
        title: '🚨 Emergency Alert',
        body: reason || 'A student has triggered an emergency alert during their session.',
        data: { booking_id: bookingId },
    })

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

    const now = new Date().toISOString()
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, student_id, branch, gender, year, banned_until')
        .eq('role', 'student')
        .neq('id', user.id)
        .ilike('full_name', `%${query.trim()}%`)
        .or(`banned_until.is.null,banned_until.lt.${now}`)
        .limit(10)

    if (error) {
        console.error('Error searching students:', error)
        return []
    }

    return data || []
}
