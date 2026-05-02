'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, gt, ne, desc } from 'drizzle-orm'
import { db } from '@/db'
import { profiles, notifications, playRequests, bookings } from '@/db/schema'
import { getCurrentUser } from '@/lib/session'
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
    created_at: Date
}

// ─── Core send helpers ────────────────────────────────────────────────────────

export async function sendNotification(input: NotificationInput): Promise<string | null> {
    try {
        const [row] = await db
            .insert(notifications)
            .values({
                recipient_id: input.recipientId,
                sender_id: input.senderId ?? null,
                type: input.type,
                title: input.title,
                body: input.body,
                data: input.data ?? {},
            })
            .returning({ id: notifications.id })
        return row?.id ?? null
    } catch (err) {
        console.error('sendNotification error:', err)
        return null
    }
}

export async function sendNotifications(inputs: NotificationInput[]): Promise<void> {
    if (inputs.length === 0) return
    try {
        await db.insert(notifications).values(
            inputs.map((n) => ({
                recipient_id: n.recipientId,
                sender_id: n.senderId ?? null,
                type: n.type,
                title: n.title,
                body: n.body,
                data: n.data ?? {},
            }))
        )
    } catch (err) {
        console.error('sendNotifications error:', err)
    }
}

export async function notifyManagers(input: Omit<NotificationInput, 'recipientId'>): Promise<void> {
    const managers = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.role, 'manager'))
    if (managers.length === 0) return
    await sendNotifications(managers.map((m) => ({ ...input, recipientId: m.id })))
}

export async function notifyAdmins(input: Omit<NotificationInput, 'recipientId'>): Promise<void> {
    const admins = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.role, 'admin'))
    if (admins.length === 0) return
    await sendNotifications(admins.map((a) => ({ ...input, recipientId: a.id })))
}

export async function notifyAdminsAndManagers(
    input: Omit<NotificationInput, 'recipientId'>
): Promise<void> {
    const { inArray } = await import('drizzle-orm')
    const staff = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.role, ['admin', 'superuser', 'manager']))
    if (staff.length === 0) return
    await sendNotifications(staff.map((s) => ({ ...input, recipientId: s.id })))
}

export async function broadcastToAllStudents(
    input: Omit<NotificationInput, 'recipientId'>
): Promise<void> {
    const students = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.role, 'student'))
    if (students.length === 0) return
    await sendNotifications(students.map((s) => ({ ...input, recipientId: s.id })))
}

// ─── User-facing read actions ─────────────────────────────────────────────────

export async function getMyNotifications(
    unreadOnly = false,
    limit = 60
): Promise<AppNotification[]> {
    const user = await getCurrentUser()
    if (!user) return []

    const conditions = [
        eq(notifications.recipient_id, user.id),
        ne(notifications.type, 'play_request_received'),
    ]
    if (unreadOnly) {
        const { eq: eqFn } = await import('drizzle-orm')
        conditions.push(eqFn(notifications.is_read, false))
    }

    const data = await db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.created_at))
        .limit(limit)

    return data as AppNotification[]
}

export async function getNewNotifications(since: string): Promise<AppNotification[]> {
    const user = await getCurrentUser()
    if (!user) return []

    const data = await db
        .select()
        .from(notifications)
        .where(
            and(
                eq(notifications.recipient_id, user.id),
                eq(notifications.is_read, false),
                gt(notifications.created_at, new Date(since))
            )
        )
        .orderBy(desc(notifications.created_at))
        .limit(10)

    return data as AppNotification[]
}

export async function getUnreadCount(): Promise<number> {
    const user = await getCurrentUser()
    if (!user) return 0

    const { count } = await import('drizzle-orm')
    const [{ value }] = await db
        .select({ value: count() })
        .from(notifications)
        .where(
            and(
                eq(notifications.recipient_id, user.id),
                eq(notifications.is_read, false),
                ne(notifications.type, 'play_request_received')
            )
        )
    return value ?? 0
}

export async function markNotificationRead(notificationId: string): Promise<void> {
    const user = await getCurrentUser()
    if (!user) return

    await db
        .update(notifications)
        .set({ is_read: true })
        .where(and(eq(notifications.id, notificationId), eq(notifications.recipient_id, user.id)))

    revalidatePath('/student/notifications')
    revalidatePath('/admin/notifications')
    revalidatePath('/manager/notifications')
}

export async function markAllNotificationsRead(): Promise<void> {
    const user = await getCurrentUser()
    if (!user) return

    await db
        .update(notifications)
        .set({ is_read: true })
        .where(and(eq(notifications.recipient_id, user.id), eq(notifications.is_read, false)))

    revalidatePath('/student/notifications')
    revalidatePath('/admin/notifications')
    revalidatePath('/manager/notifications')
}

// ─── Play request actions ─────────────────────────────────────────────────────

export async function getMyPlayRequests() {
    const user = await getCurrentUser()
    if (!user) return []

    const data = await db
        .select({
            id: playRequests.id,
            booking_id: playRequests.booking_id,
            requester_id: playRequests.requester_id,
            recipient_id: playRequests.recipient_id,
            status: playRequests.status,
            notification_id: playRequests.notification_id,
            created_at: playRequests.created_at,
            responded_at: playRequests.responded_at,
            bookings: {
                id: bookings.id,
                start_time: bookings.start_time,
                end_time: bookings.end_time,
                status: bookings.status,
            },
            requester: {
                full_name: profiles.full_name,
                student_id: profiles.student_id,
            },
        })
        .from(playRequests)
        .leftJoin(bookings, eq(playRequests.booking_id, bookings.id))
        .leftJoin(profiles, eq(playRequests.requester_id, profiles.id))
        .where(eq(playRequests.recipient_id, user.id))
        .orderBy(desc(playRequests.created_at))
        .limit(30)

    // fetch court info separately for each booking
    const { courts } = await import('@/db/schema')
    const bookingIds = [...new Set(data.map((r) => r.booking_id).filter(Boolean))]
    const courtMap: Record<string, { name: string; sport: string }> = {}
    if (bookingIds.length > 0) {
        const { inArray } = await import('drizzle-orm')
        const courtRows = await db
            .select({ id: bookings.id, name: courts.name, sport: courts.sport })
            .from(bookings)
            .leftJoin(courts, eq(bookings.court_id, courts.id))
            .where(inArray(bookings.id, bookingIds))
        courtRows.forEach((r) => {
            if (r.id) courtMap[r.id] = { name: r.name ?? '', sport: r.sport ?? '' }
        })
    }

    return data.map((r) => ({
        ...r,
        bookings: r.bookings ? { ...r.bookings, courts: courtMap[r.booking_id] ?? null } : null,
    }))
}

export async function acceptPlayRequest(playRequestId: string) {
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    const { inArray } = await import('drizzle-orm')
    const { courts } = await import('@/db/schema')

    const [pr] = await db
        .select()
        .from(playRequests)
        .where(and(eq(playRequests.id, playRequestId), eq(playRequests.recipient_id, user.id)))

    if (!pr) return { error: 'Play request not found' }
    if (pr.status !== 'pending') return { error: 'Already responded to this request' }

    const [bkRow] = await db
        .select({
            id: bookings.id,
            status: bookings.status,
            user_id: bookings.user_id,
            start_time: bookings.start_time,
            players_list: bookings.players_list,
            num_players: bookings.num_players,
            court_name: courts.name,
            court_sport: courts.sport,
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, pr.booking_id))

    if (!bkRow) return { error: 'Booking not found' }

    if (['cancelled', 'rejected', 'completed'].includes(bkRow.status ?? '')) {
        await db
            .update(playRequests)
            .set({ status: 'expired', responded_at: new Date() })
            .where(eq(playRequests.id, playRequestId))
        return { error: 'The booking has already been cancelled or completed' }
    }

    const [profile] = await db
        .select({
            id: profiles.id,
            full_name: profiles.full_name,
            branch: profiles.branch,
            gender: profiles.gender,
            year: profiles.year,
        })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    const playersList = Array.isArray(bkRow.players_list) ? (bkRow.players_list as any[]) : []
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

    await db
        .update(bookings)
        .set({
            players_list: updatedList,
            // Only increment num_players if the player was NOT already in the list.
            // When invited at booking creation, the player is already counted in num_players.
            num_players: inList ? bkRow.num_players || 1 : (bkRow.num_players || 1) + 1,
        })
        .where(eq(bookings.id, pr.booking_id))

    await db
        .update(playRequests)
        .set({ status: 'accepted', responded_at: new Date() })
        .where(eq(playRequests.id, playRequestId))

    if (pr.notification_id) {
        await db
            .update(notifications)
            .set({ is_read: true })
            .where(eq(notifications.id, pr.notification_id))
    }

    const courtName = bkRow.court_name || 'Court'
    const startDisplay = new Date(bkRow.start_time).toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

    await sendNotification({
        recipientId: bkRow.user_id,
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
    const user = await getCurrentUser()
    if (!user) return { error: 'Unauthorized' }

    const { courts } = await import('@/db/schema')

    const [pr] = await db
        .select()
        .from(playRequests)
        .where(and(eq(playRequests.id, playRequestId), eq(playRequests.recipient_id, user.id)))

    if (!pr) return { error: 'Play request not found' }
    if (pr.status !== 'pending') return { error: 'Already responded to this request' }

    const [bkRow] = await db
        .select({
            id: bookings.id,
            status: bookings.status,
            user_id: bookings.user_id,
            start_time: bookings.start_time,
            num_players: bookings.num_players,
            equipment_ids: bookings.equipment_ids,
            players_list: bookings.players_list,
            court_name: courts.name,
            court_sport: courts.sport,
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, pr.booking_id))

    if (!bkRow) return { error: 'Booking not found' }

    const [profile] = await db
        .select({ full_name: profiles.full_name })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    const playersList = Array.isArray(bkRow.players_list) ? (bkRow.players_list as any[]) : []
    const updatedList = playersList.filter(
        (p: any) => (typeof p === 'string' ? p : p.id) !== user.id
    )
    const newNumPlayers = Math.max(1, (bkRow.num_players || 1) - 1)

    const sport = bkRow.court_sport || ''
    const courtName = bkRow.court_name || 'Court'
    const limits = getPlayerLimits(sport)
    const startDisplay = new Date(bkRow.start_time).toLocaleString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })

    let bookingCancelled = false

    if (newNumPlayers < limits.min) {
        const equipIds: string[] = (bkRow.equipment_ids as string[]) || []
        if (equipIds.length > 0) {
            const { equipment } = await import('@/db/schema')
            const { inArray } = await import('drizzle-orm')
            await db
                .update(equipment)
                .set({ is_available: true })
                .where(inArray(equipment.id, equipIds))
        }

        await db
            .update(bookings)
            .set({ status: 'cancelled', players_list: updatedList, num_players: newNumPlayers })
            .where(eq(bookings.id, pr.booking_id))
        bookingCancelled = true

        await sendNotification({
            recipientId: bkRow.user_id,
            senderId: user.id,
            type: 'play_request_booking_cancelled',
            title: 'Booking Cancelled — Not Enough Players',
            body: `Your booking for ${courtName} on ${startDisplay} was cancelled because ${profile?.full_name || 'a player'} declined and the player count dropped below the minimum.`,
            data: { booking_id: pr.booking_id },
        })

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
        await db
            .update(bookings)
            .set({ players_list: updatedList, num_players: newNumPlayers })
            .where(eq(bookings.id, pr.booking_id))

        await sendNotification({
            recipientId: bkRow.user_id,
            senderId: user.id,
            type: 'play_request_rejected',
            title: 'Play Request Declined',
            body: `${profile?.full_name || 'A player'} declined your play request for ${courtName} on ${startDisplay}.`,
            data: { booking_id: pr.booking_id, player_name: profile?.full_name },
        })
    }

    await db
        .update(playRequests)
        .set({ status: 'rejected', responded_at: new Date() })
        .where(eq(playRequests.id, playRequestId))

    if (pr.notification_id) {
        await db
            .update(notifications)
            .set({ is_read: true })
            .where(eq(notifications.id, pr.notification_id))
    }

    revalidatePath('/student/play-requests')
    revalidatePath('/student/reservations')
    return { success: true, bookingCancelled }
}
