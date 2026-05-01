'use server'

import { db } from '@/db'
import { bookings, profiles, courts, equipment, feedbackComplaints, playRequests, studentViolations, notifications } from '@/db/schema'
import { getCurrentUser } from '@/lib/session'
import {
    eq, ne, and, or, gt, lt, gte, lte, desc, asc, inArray, notInArray, isNull, ilike, sql,
} from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { addMinutes } from 'date-fns'
import { getPlayerLimits } from '@/lib/sport-config'
import {
    sendNotification,
    sendNotifications,
    notifyManagers,
    notifyAdminsAndManagers,
} from '@/actions/notifications'

export async function getBookingsForDateRange(courtId: string, startDate: Date, endDate: Date) {
    const rows = await db
        .select({
            id: bookings.id,
            user_id: bookings.user_id,
            court_id: bookings.court_id,
            start_time: bookings.start_time,
            end_time: bookings.end_time,
            status: bookings.status,
            players_list: bookings.players_list,
            equipment_ids: bookings.equipment_ids,
            is_maintenance: bookings.is_maintenance,
            is_priority: bookings.is_priority,
            num_players: bookings.num_players,
            notes: bookings.notes,
            created_at: bookings.created_at,
            profiles: { full_name: profiles.full_name },
        })
        .from(bookings)
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .where(
            and(
                eq(bookings.court_id, courtId),
                gte(bookings.start_time, startDate),
                lte(bookings.end_time, endDate),
                ne(bookings.status, 'cancelled'),
                ne(bookings.status, 'rejected')
            )
        )

    return rows
}

export async function getAvailableEquipment(
    sport: string,
    startTime?: string,
    endTime?: string
) {
    const allEquipment = await db
        .select({
            id: equipment.id,
            name: equipment.name,
            sport: equipment.sport,
            condition: equipment.condition,
            is_available: equipment.is_available,
        })
        .from(equipment)
        .where(
            and(
                ilike(equipment.sport, sport),
                ne(equipment.condition, 'lost'),
                ne(equipment.condition, 'retired'),
                eq(equipment.is_available, true)
            )
        )
        .orderBy(asc(equipment.name))

    if (!allEquipment || allEquipment.length === 0) return []

    const reservedIds = new Set<string>()

    if (startTime && endTime) {
        const start = new Date(startTime)
        const end = new Date(endTime)
        const overlapping = await db
            .select({ equipment_ids: bookings.equipment_ids })
            .from(bookings)
            .where(
                and(
                    ne(bookings.status, 'cancelled'),
                    ne(bookings.status, 'rejected'),
                    ne(bookings.status, 'completed'),
                    lt(bookings.start_time, end),
                    gt(bookings.end_time, start)
                )
            )

        overlapping.forEach((b) => {
            ;(b.equipment_ids || []).forEach((id) => reservedIds.add(id))
        })
    }

    return allEquipment.map((eq_) => ({
        ...eq_,
        in_use: reservedIds.has(eq_.id),
    }))
}

export async function createBooking(prevState: any, formData: FormData) {
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

    if (startTime < new Date()) {
        return { error: 'Cannot book a slot in the past' }
    }

    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    // Check ban and priority status
    const [profileData] = await db
        .select({ banned_until: profiles.banned_until, priority_booking_remaining: profiles.priority_booking_remaining })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    if (profileData?.banned_until && new Date(profileData.banned_until) > new Date()) {
        const banDate = new Date(profileData.banned_until).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        })
        return {
            error: `You are temporarily banned until ${banDate} due to repeated late arrivals. Contact admin for early clearance.`,
        }
    }

    // Check violation count (suspended if 3+)
    const [{ count: violationCount }] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(studentViolations)
        .where(eq(studentViolations.student_id, user.id))

    if (violationCount >= 3) {
        return {
            error: 'Your account has been suspended due to 3 or more violations. Contact admin.',
        }
    }

    // Duration validation
    if (duration === 90) {
        if ((profileData?.priority_booking_remaining ?? 0) <= 0) {
            return {
                error: 'You do not have a priority booking slot available. Only 30 or 60 minute bookings are allowed.',
            }
        }
    } else if (duration !== 30 && duration !== 60) {
        return { error: 'Invalid booking duration. Please select 30 or 60 minutes.' }
    }

    // Overlap check — same court
    const conflictingBookings = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
            and(
                eq(bookings.court_id, courtId),
                ne(bookings.status, 'cancelled'),
                ne(bookings.status, 'rejected'),
                lt(bookings.start_time, endTime),
                gt(bookings.end_time, startTime)
            )
        )

    if (conflictingBookings.length > 0) {
        return { error: 'Time slot is already booked' }
    }

    // Prevent double-booking same student on any court
    const studentConflicts = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(
            and(
                eq(bookings.user_id, user.id),
                ne(bookings.status, 'cancelled'),
                ne(bookings.status, 'rejected'),
                lt(bookings.start_time, endTime),
                gt(bookings.end_time, startTime)
            )
        )

    if (studentConflicts.length > 0) {
        return { error: 'You already have a booking during this time' }
    }

    // Parse optional fields
    const equipmentIds: string[] = equipmentIdsStr ? JSON.parse(equipmentIdsStr) : []
    const numPlayers = numPlayersStr ? parseInt(numPlayersStr) : 2
    const rawPlayersList: { id: string; full_name?: string; [key: string]: unknown }[] =
        playersListStr ? JSON.parse(playersListStr) : []

    // Enrich players_list with profile snapshot
    let playersList = rawPlayersList
    if (rawPlayersList.length > 0) {
        const playerIds = rawPlayersList.map((p) => p.id).filter(Boolean)
        const playerProfiles = await db
            .select({ id: profiles.id, full_name: profiles.full_name, branch: profiles.branch, gender: profiles.gender, year: profiles.year })
            .from(profiles)
            .where(inArray(profiles.id, playerIds))

        const profileMap = Object.fromEntries(playerProfiles.map((p) => [p.id, p]))
        playersList = rawPlayersList.map((p) => ({
            ...p,
            branch: profileMap[p.id]?.branch ?? (p.branch as string | null) ?? null,
            gender: profileMap[p.id]?.gender ?? (p.gender as string | null) ?? null,
            year: profileMap[p.id]?.year ?? (p.year as string | null) ?? null,
            full_name: profileMap[p.id]?.full_name ?? p.full_name ?? undefined,
            status: 'pending',
        }))
    }

    // Validate player count against sport limits
    const [courtData] = await db
        .select({ sport: courts.sport, name: courts.name })
        .from(courts)
        .where(eq(courts.id, courtId))

    if (courtData) {
        const limits = getPlayerLimits(courtData.sport)
        if (numPlayers < limits.min) {
            return { error: `Minimum ${limits.min} players required for ${courtData.sport}` }
        }
        if (limits.max && numPlayers > limits.max) {
            return { error: `Maximum ${limits.max} players allowed for ${courtData.sport}` }
        }
    }

    // Check for time-slot conflicts on requested equipment
    if (equipmentIds.length > 0) {
        const conflicts = await db
            .select({ equipment_ids: bookings.equipment_ids })
            .from(bookings)
            .where(
                and(
                    ne(bookings.status, 'cancelled'),
                    ne(bookings.status, 'rejected'),
                    ne(bookings.status, 'completed'),
                    lt(bookings.start_time, endTime),
                    gt(bookings.end_time, startTime)
                )
            )

        const conflictingIds = new Set<string>()
        conflicts.forEach((b) => (b.equipment_ids || []).forEach((id) => conflictingIds.add(id)))

        const hasConflict = equipmentIds.some((id) => conflictingIds.has(id))
        if (hasConflict) {
            return {
                error: 'One or more equipment items are already booked for this time slot. Please refresh and try again.',
            }
        }
    }

    // Insert booking
    const [newBooking] = await db
        .insert(bookings)
        .values({
            user_id: user.id,
            court_id: courtId,
            start_time: startTime,
            end_time: endTime,
            status: 'confirmed',
            players_list: playersList,
            equipment_ids: equipmentIds,
            num_players: numPlayers,
        })
        .returning({ id: bookings.id })

    if (!newBooking) {
        return { error: 'Failed to create booking' }
    }

    // Send play requests + notifications to invited players
    if (rawPlayersList.length > 0) {
        const courtName = courtData?.name || 'Court'
        const sport = courtData?.sport || ''
        const startDisplay = startTime.toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        const [bookerProfile] = await db
            .select({ full_name: profiles.full_name })
            .from(profiles)
            .where(eq(profiles.id, user.id))
        const bookerName = bookerProfile?.full_name || 'Someone'

        for (const player of rawPlayersList) {
            // Create play request first to get its ID, then include it in the notification data
            const [newPR] = await db
                .insert(playRequests)
                .values({
                    booking_id: newBooking.id,
                    requester_id: user.id,
                    recipient_id: player.id,
                    status: 'pending',
                    notification_id: null,
                })
                .returning({ id: playRequests.id })

            const notifId = await sendNotification({
                recipientId: player.id,
                senderId: user.id,
                type: 'play_request_received',
                title: 'Play Request',
                body: `${bookerName} invited you to play ${sport} at ${courtName} on ${startDisplay}. Accept or decline below.`,
                data: {
                    booking_id: newBooking.id,
                    play_request_id: newPR.id,
                    court_name: courtName,
                    sport,
                    start_time: startTime.toISOString(),
                    end_time: endTime.toISOString(),
                    booker_name: bookerName,
                },
            })

            if (notifId) {
                await db
                    .update(playRequests)
                    .set({ notification_id: notifId })
                    .where(eq(playRequests.id, newPR.id))
            }
        }

        // Notify managers of new booking
        await notifyManagers({
            senderId: user.id,
            type: 'new_booking',
            title: 'New Booking',
            body: `${bookerName} booked ${courtName} (${sport}) for ${startDisplay}.`,
            data: {
                booking_id: newBooking.id,
                court_name: courtName,
                sport,
                start_time: startTime.toISOString(),
                booker_name: bookerName,
            },
        })
    }

    // Consume priority booking slot if 90-min
    if (duration === 90) {
        await db
            .update(profiles)
            .set({ priority_booking_remaining: 0 })
            .where(eq(profiles.id, user.id))

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

async function cancelPendingPlayRequests(bookingId: string): Promise<void> {
    const pending = await db
        .select({ id: playRequests.id, notification_id: playRequests.notification_id })
        .from(playRequests)
        .where(and(eq(playRequests.booking_id, bookingId), eq(playRequests.status, 'pending')))

    if (pending.length === 0) return

    await db
        .update(playRequests)
        .set({ status: 'expired', responded_at: new Date() })
        .where(and(eq(playRequests.booking_id, bookingId), eq(playRequests.status, 'pending')))

    const notifIds = pending.map((r) => r.notification_id).filter((id): id is string => id !== null)
    if (notifIds.length > 0) {
        await db.update(notifications).set({ is_read: true }).where(inArray(notifications.id, notifIds))
    }

    revalidatePath('/student/play-requests')
}

export async function cancelBooking(bookingId: string) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    const [booking] = await db
        .select({
            user_id: bookings.user_id,
            status: bookings.status,
            equipment_ids: bookings.equipment_ids,
            start_time: bookings.start_time,
            players_list: bookings.players_list,
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))

    if (!booking) return { error: 'Booking not found' }
    if (booking.user_id !== user.id) return { error: 'Not your booking' }
    if (!['pending_confirmation', 'confirmed', 'waiting_manager'].includes(booking.status ?? '')) {
        return { error: 'Cannot cancel this booking' }
    }

    // Deduct -3 points if cancellation < 3 hours before start
    const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
    if (new Date(booking.start_time) < threeHoursFromNow) {
        await db
            .update(profiles)
            .set({ points: sql`COALESCE(${profiles.points}, 0) + ${-3}` })
            .where(and(eq(profiles.id, user.id), eq(profiles.role, 'student')))
    }

    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bookingId))
    await cancelPendingPlayRequests(bookingId)

    const courtInfo = booking.courts
    const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
    const confirmedPlayerIds = playersList
        .filter((p: any) => p.status === 'confirmed')
        .map((p: any) => (typeof p === 'string' ? p : p.id))
        .filter((id: string) => id !== user.id)

    if (confirmedPlayerIds.length > 0) {
        const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        await sendNotifications(
            confirmedPlayerIds.map((pid: string) => ({
                recipientId: pid,
                senderId: user.id,
                type: 'booking_cancelled_by_booker',
                title: 'Booking Cancelled',
                body: `Your booking for ${courtInfo?.name || 'a court'} (${courtInfo?.sport || ''}) on ${startDisplay} has been cancelled by the booker.`,
                data: { booking_id: bookingId },
            }))
        )
    }

    revalidatePath('/student/reservations')
    revalidatePath('/student')
    revalidatePath('/student/profile')
    return { success: true }
}

export async function withdrawFromBooking(bookingId: string) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    const [booking] = await db
        .select({
            user_id: bookings.user_id,
            status: bookings.status,
            players_list: bookings.players_list,
            num_players: bookings.num_players,
            equipment_ids: bookings.equipment_ids,
            start_time: bookings.start_time,
            courts: { sport: courts.sport, name: courts.name },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))

    if (!booking) return { error: 'Booking not found' }

    if (booking.user_id === user.id) {
        return { error: 'You are the booker. Use cancel instead.' }
    }

    if (!['pending_confirmation', 'confirmed'].includes(booking.status ?? '')) {
        return { error: 'Cannot withdraw from this booking' }
    }

    const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
    const updatedPlayersList = playersList.filter((p: any) => {
        const playerId = typeof p === 'string' ? p : p?.id
        return playerId !== user.id
    })

    const newNumPlayers = Math.max(1, (booking.num_players || 2) - 1)
    const sport = booking.courts?.sport || ''
    const limits = getPlayerLimits(sport)

    if (newNumPlayers < limits.min) {
        await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bookingId))
        await cancelPendingPlayRequests(bookingId)

        const courtInfo = booking.courts
        const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
        const cancelBody = `Your booking for ${courtInfo?.name || 'a court'} on ${startDisplay} was automatically cancelled because the player count dropped below the minimum required (${limits.min}).`

        const notifyIds = new Set<string>()
        notifyIds.add(booking.user_id)
        for (const p of updatedPlayersList) {
            const pid = typeof p === 'string' ? p : p.id
            const pStatus = typeof p === 'string' ? undefined : p.status
            if (!pStatus || pStatus === 'confirmed') notifyIds.add(pid)
        }
        notifyIds.delete(user.id)

        const notifBatch = Array.from(notifyIds).map((pid) => ({
            recipientId: pid,
            senderId: user.id,
            type: 'booking_auto_cancelled',
            title: 'Booking Auto-Cancelled',
            body: cancelBody,
            data: { booking_id: bookingId },
        }))

        if (notifBatch.length > 0) {
            await sendNotifications(notifBatch)
        }

        revalidatePath('/student/reservations')
        revalidatePath('/student')
        revalidatePath('/student/book')
        revalidatePath('/manager')
        revalidatePath('/admin/reservations')
        return {
            success: true,
            cancelled: true,
            reason: `Booking cancelled: player count dropped below minimum (${limits.min})`,
        }
    }

    await db
        .update(bookings)
        .set({ players_list: updatedPlayersList, num_players: newNumPlayers })
        .where(eq(bookings.id, bookingId))

    const [withdrawerProfile] = await db
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    const courtInfo = booking.courts
    const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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
    const user = await getCurrentUser()
    if (!user || user.id !== userId) return { current: [], upcoming: [], past: [] }
    const now = new Date()

    const ownBookings = await db
        .select({
            id: bookings.id,
            user_id: bookings.user_id,
            court_id: bookings.court_id,
            start_time: bookings.start_time,
            end_time: bookings.end_time,
            status: bookings.status,
            players_list: bookings.players_list,
            equipment_ids: bookings.equipment_ids,
            is_maintenance: bookings.is_maintenance,
            is_priority: bookings.is_priority,
            num_players: bookings.num_players,
            notes: bookings.notes,
            created_at: bookings.created_at,
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.user_id, userId))
        .orderBy(desc(bookings.start_time))

    // Bookings where student is in players_list (JSONB containment)
    const playerBookings = await db
        .select({
            id: bookings.id,
            user_id: bookings.user_id,
            court_id: bookings.court_id,
            start_time: bookings.start_time,
            end_time: bookings.end_time,
            status: bookings.status,
            players_list: bookings.players_list,
            equipment_ids: bookings.equipment_ids,
            is_maintenance: bookings.is_maintenance,
            is_priority: bookings.is_priority,
            num_players: bookings.num_players,
            notes: bookings.notes,
            created_at: bookings.created_at,
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(
            and(
                ne(bookings.user_id, userId),
                sql`${bookings.players_list} @> ${JSON.stringify([{ id: userId }])}::jsonb`
            )
        )
        .orderBy(desc(bookings.start_time))

    const allBookings = [...ownBookings, ...playerBookings]
    const seen = new Set<string>()
    const data = allBookings.filter((b) => {
        if (seen.has(b.id)) return false
        seen.add(b.id)
        return true
    })

    const current = data.filter(
        (b) =>
            b.status === 'active' &&
            new Date(b.start_time) <= now &&
            new Date(b.end_time) >= now
    )

    const upcoming = data.filter(
        (b) =>
            ['pending_confirmation', 'confirmed', 'waiting_manager'].includes(b.status ?? '') &&
            new Date(b.end_time) > now
    )

    const past = data.filter(
        (b) =>
            b.status === 'completed' ||
            b.status === 'cancelled' ||
            b.status === 'rejected' ||
            (new Date(b.end_time) < now && b.status !== 'active')
    )

    return { current, upcoming, past }
}

export async function studentStartPlay(bookingId: string) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    const [booking] = await db
        .select({
            user_id: bookings.user_id,
            status: bookings.status,
            start_time: bookings.start_time,
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))

    if (!booking) return { error: 'Booking not found' }
    if (booking.user_id !== user.id) return { error: 'Not your booking' }
    if (booking.status !== 'confirmed') {
        return { error: 'Booking cannot be started in its current state' }
    }

    await db
        .update(bookings)
        .set({ status: 'waiting_manager' })
        .where(eq(bookings.id, bookingId))

    const courtInfo = booking.courts
    const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
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

export async function studentEmergencyAlert(bookingId: string, reason: string) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    await db.insert(feedbackComplaints).values({
        student_id: user.id,
        booking_id: bookingId,
        title: 'Emergency Alert (Student)',
        description: reason,
        category: 'emergency_by_student',
        status: 'open',
    })

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

export async function submitFeedback(title: string, description: string, category: string) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    if (!title.trim() || !description.trim()) {
        return { error: 'Title and description are required' }
    }

    await db.insert(feedbackComplaints).values({
        student_id: user.id,
        title: title.trim(),
        description: description.trim(),
        category,
        status: 'open',
    })

    revalidatePath('/admin/feedback')
    return { success: true }
}

export async function searchStudents(query: string) {
    const user = await getCurrentUser()
    if (!user) return []

    if (!query || query.trim().length < 2) return []

    const now = new Date()
    const data = await db
        .select({
            id: profiles.id,
            full_name: profiles.full_name,
            student_id: profiles.student_id,
            branch: profiles.branch,
            gender: profiles.gender,
            year: profiles.year,
            banned_until: profiles.banned_until,
        })
        .from(profiles)
        .where(
            and(
                eq(profiles.role, 'student'),
                ne(profiles.id, user.id),
                ilike(profiles.full_name, `%${query.trim()}%`),
                or(isNull(profiles.banned_until), lt(profiles.banned_until, now))
            )
        )
        .limit(10)

    return data
}
