'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { revalidatePath } from 'next/cache'
import { getPlayerLimits } from '@/lib/sport-config'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NotificationInput = {
    recipientId: string
    senderId?: string | null
    type: string
    title: string
    body: string
    data?: Record<string, any>
}

export type AppNotification = {
    id: string
    recipient_id: string
    sender_id: string | null
    type: string
    title: string
    body: string
    data: Record<string, any>
    is_read: boolean
    created_at: string
}

// ─── Core send helpers (use admin client — works for any recipient) ────────────

export async function sendNotification(input: NotificationInput): Promise<string | null> {
    const adminSupabase = createAdminClient()
    const { data, error } = await adminSupabase
        .from('notifications')
        .insert({
            recipient_id: input.recipientId,
            sender_id: input.senderId ?? null,
            type: input.type,
            title: input.title,
            body: input.body,
            data: input.data ?? {},
        })
        .select('id')
        .single()

    if (error) {
        console.error('sendNotification error:', error)
        return null
    }
    return data?.id ?? null
}

export async function sendNotifications(inputs: NotificationInput[]): Promise<void> {
    if (inputs.length === 0) return
    const adminSupabase = createAdminClient()
    const { error } = await adminSupabase.from('notifications').insert(
        inputs.map((n) => ({
            recipient_id: n.recipientId,
            sender_id: n.senderId ?? null,
            type: n.type,
            title: n.title,
            body: n.body,
            data: n.data ?? {},
        }))
    )

    if (error) console.error('sendNotifications error:', error)
}

/** Broadcast to all managers */
export async function notifyManagers(input: Omit<NotificationInput, 'recipientId'>): Promise<void> {
    const adminSupabase = createAdminClient()
    const { data: managers } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('role', 'manager')

    if (!managers || managers.length === 0) return
    await sendNotifications(managers.map((m: { id: string }) => ({ ...input, recipientId: m.id })))
}

/** Broadcast to all admins */
export async function notifyAdmins(input: Omit<NotificationInput, 'recipientId'>): Promise<void> {
    const adminSupabase = createAdminClient()
    const { data: admins } = await adminSupabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'superuser'])

    if (!admins || admins.length === 0) return
    await sendNotifications(admins.map((a: { id: string }) => ({ ...input, recipientId: a.id })))
}

/** Broadcast to all managers AND admins */
export async function notifyAdminsAndManagers(
    input: Omit<NotificationInput, 'recipientId'>
): Promise<void> {
    const adminSupabase = createAdminClient()
    const { data: staff } = await adminSupabase
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'superuser', 'manager'])

    if (!staff || staff.length === 0) return
    await sendNotifications(staff.map((s: { id: string }) => ({ ...input, recipientId: s.id })))
}

/** Broadcast to all students */
export async function broadcastToAllStudents(
    input: Omit<NotificationInput, 'recipientId'>
): Promise<void> {
    const adminSupabase = createAdminClient()
    const { data: students } = await adminSupabase
        .from('profiles')
        .select('id')
        .eq('role', 'student')

    if (!students || students.length === 0) return
    await sendNotifications(students.map((s: { id: string }) => ({ ...input, recipientId: s.id })))
}

// ─── User-facing read actions ─────────────────────────────────────────────────

export async function getMyNotifications(
    unreadOnly = false,
    limit = 60
): Promise<AppNotification[]> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    let query = supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        // Exclude play request notifications — those live on the play-requests page
        .not('type', 'eq', 'play_request_received')
        .order('created_at', { ascending: false })
        .limit(limit)

    if (unreadOnly) query = query.eq('is_read', false)

    const { data } = await query
    return (data || []) as AppNotification[]
}

/** Called by the popup's polling — returns notifications created after `since` */
export async function getNewNotifications(since: string): Promise<AppNotification[]> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .eq('is_read', false)
        .gt('created_at', since)
        .order('created_at', { ascending: false })
        .limit(10)

    return (data || []) as AppNotification[]
}

export async function getUnreadCount(): Promise<number> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return 0

    const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)
        // Exclude play request notifications — those live on the play-requests page
        .not('type', 'eq', 'play_request_received')

    return count ?? 0
}

export async function markNotificationRead(notificationId: string): Promise<void> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('recipient_id', user.id) // ownership guard — only marks own notifications
    revalidatePath('/student/notifications')
    revalidatePath('/admin/notifications')
    revalidatePath('/manager/notifications')
}

export async function markAllNotificationsRead(): Promise<void> {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user.id)
        .eq('is_read', false)

    revalidatePath('/student/notifications')
    revalidatePath('/admin/notifications')
    revalidatePath('/manager/notifications')
}

// ─── Play request actions ─────────────────────────────────────────────────────

export async function getMyPlayRequests() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data } = await supabase
        .from('play_requests')
        .select(
            `
            *,
            bookings (
                id, start_time, end_time, status,
                courts (name, sport)
            ),
            requester:profiles!play_requests_requester_id_fkey (full_name, student_id)
        `
        )
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)

    return data || []
}

export async function acceptPlayRequest(playRequestId: string) {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 1. Fetch the play request + booking details
    const { data: pr } = await adminSupabase
        .from('play_requests')
        .select('*, bookings(id, status, user_id, start_time, courts(name, sport))')
        .eq('id', playRequestId)
        .eq('recipient_id', user.id)
        .single()

    if (!pr) return { error: 'Play request not found' }
    if (pr.status !== 'pending') return { error: 'Already responded to this request' }

    const booking = pr.bookings as any
    if (['cancelled', 'rejected', 'completed'].includes(booking?.status)) {
        await adminSupabase
            .from('play_requests')
            .update({ status: 'expired', responded_at: new Date().toISOString() })
            .eq('id', playRequestId)
        return { error: 'The booking has already been cancelled or completed' }
    }

    // 2. Fetch the accepting player's profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, branch, gender, year')
        .eq('id', user.id)
        .single()

    // 3. Update players_list — change this player's status to 'confirmed'
    const { data: bk } = await adminSupabase
        .from('bookings')
        .select('players_list, num_players')
        .eq('id', pr.booking_id)
        .single()

    const playersList = Array.isArray(bk?.players_list) ? bk.players_list : []
    const inList = playersList.some((p: any) => (typeof p === 'string' ? p : p.id) === user.id)

    const updatedList = inList
        ? playersList.map((p: any) => {
              const pid = typeof p === 'string' ? p : p.id
              return pid === user.id ? { ...p, status: 'confirmed' } : p
          })
        : [
              ...playersList,
              {
                  id: user.id,
                  full_name: profile?.full_name,
                  branch: profile?.branch,
                  gender: profile?.gender,
                  year: profile?.year,
                  status: 'confirmed',
              },
          ]

    await adminSupabase
        .from('bookings')
        .update({ players_list: updatedList, num_players: (bk?.num_players || 1) + 1 })
        .eq('id', pr.booking_id)

    // 4. Mark play request accepted
    await adminSupabase
        .from('play_requests')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', playRequestId)

    // 5. Mark the play_request notification as read
    if (pr.notification_id) {
        await adminSupabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', pr.notification_id)
    }

    // 6. Notify the booker — N2
    const courtName = booking.courts?.name || 'Court'
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
        type: 'play_request_accepted',
        title: 'Play Request Accepted',
        body: `${profile?.full_name || 'A player'} accepted your play request for ${courtName} on ${startDisplay}.`,
        data: { booking_id: pr.booking_id, player_name: profile?.full_name },
    })

    revalidatePath('/student/play-requests')
    revalidatePath('/student/reservations')
    return { success: true }
}

export async function rejectPlayRequest(playRequestId: string) {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // 1. Fetch play request + booking
    const { data: pr } = await adminSupabase
        .from('play_requests')
        .select(
            '*, bookings(id, status, user_id, start_time, num_players, equipment_ids, players_list, courts(name, sport))'
        )
        .eq('id', playRequestId)
        .eq('recipient_id', user.id)
        .single()

    if (!pr) return { error: 'Play request not found' }
    if (pr.status !== 'pending') return { error: 'Already responded to this request' }

    const booking = pr.bookings as any
    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .single()

    // 2. Remove player from players_list
    const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
    const updatedList = playersList.filter(
        (p: any) => (typeof p === 'string' ? p : p.id) !== user.id
    )
    const newNumPlayers = Math.max(1, (booking.num_players || 1) - 1)

    // 3. Check if booking falls below minimum
    const sport = booking.courts?.sport || ''
    const courtName = booking.courts?.name || 'Court'
    const limits = getPlayerLimits(sport)
    const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

    let bookingCancelled = false

    if (newNumPlayers < limits.min) {
        // Cancel booking — free equipment
        const equipIds: string[] = booking.equipment_ids || []
        if (equipIds.length > 0) {
            await adminSupabase.from('equipment').update({ is_available: true }).in('id', equipIds)
        }
        await adminSupabase
            .from('bookings')
            .update({ status: 'cancelled', players_list: updatedList, num_players: newNumPlayers })
            .eq('id', pr.booking_id)
        bookingCancelled = true

        // Notify booker — N4
        await sendNotification({
            recipientId: booking.user_id,
            senderId: user.id,
            type: 'play_request_booking_cancelled',
            title: 'Booking Cancelled — Not Enough Players',
            body: `Your booking for ${courtName} on ${startDisplay} was cancelled because ${profile?.full_name || 'a player'} declined and the player count dropped below the minimum.`,
            data: { booking_id: pr.booking_id },
        })

        // Notify all other confirmed players — N4
        const confirmedIds = updatedList
            .filter((p: any) => !p.status || p.status === 'confirmed')
            .map((p: any) => (typeof p === 'string' ? p : p.id))
        if (confirmedIds.length > 0) {
            await sendNotifications(
                confirmedIds.map((pid: string) => ({
                    recipientId: pid,
                    type: 'play_request_booking_cancelled',
                    title: 'Booking Cancelled',
                    body: `The booking for ${courtName} on ${startDisplay} has been cancelled due to insufficient players.`,
                    data: { booking_id: pr.booking_id },
                }))
            )
        }
    } else {
        await adminSupabase
            .from('bookings')
            .update({ players_list: updatedList, num_players: newNumPlayers })
            .eq('id', pr.booking_id)

        // Notify booker — N3
        await sendNotification({
            recipientId: booking.user_id,
            senderId: user.id,
            type: 'play_request_rejected',
            title: 'Play Request Declined',
            body: `${profile?.full_name || 'A player'} declined your play request for ${courtName} on ${startDisplay}.`,
            data: { booking_id: pr.booking_id, player_name: profile?.full_name },
        })
    }

    // 4. Mark play request rejected + notification read
    await adminSupabase
        .from('play_requests')
        .update({ status: 'rejected', responded_at: new Date().toISOString() })
        .eq('id', playRequestId)

    if (pr.notification_id) {
        await adminSupabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', pr.notification_id)
    }

    revalidatePath('/student/play-requests')
    revalidatePath('/student/reservations')
    return { success: true, bookingCancelled }
}
