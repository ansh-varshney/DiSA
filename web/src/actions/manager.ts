'use server'

import { db } from '@/db'
import {
    bookings,
    profiles,
    courts,
    equipment,
    feedbackComplaints,
    studentViolations,
} from '@/db/schema'
import { getCurrentUser } from '@/lib/session'
import { sendNotification, sendNotifications, notifyAdmins } from '@/actions/notifications'
import {
    eq, ne, and, or, gte, lte, gt, inArray, notInArray, isNotNull, asc, desc, sql,
} from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

// ─── Role guard ───────────────────────────────────────────────────────────────

async function requireManagerRole(): Promise<
    | { user: { id: string }; error: null }
    | { user: null; error: string }
> {
    const user = await getCurrentUser()
    if (!user) return { user: null, error: 'Unauthorized' }

    const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    if (!profile || !['manager', 'admin', 'superuser'].includes(profile.role ?? '')) {
        return { user: null, error: 'Forbidden' }
    }

    return { user, error: null }
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

async function getBookingStudentIds(bookingId: string): Promise<string[]> {
    const [bk] = await db
        .select({ user_id: bookings.user_id, players_list: bookings.players_list })
        .from(bookings)
        .where(eq(bookings.id, bookingId))

    if (!bk) return []

    const playersList = Array.isArray(bk.players_list) ? bk.players_list : []
    const extraIds = playersList
        .filter((p: any) => !p.status || p.status === 'confirmed')
        .map((p: any) => (typeof p === 'string' ? p : p?.id))
        .filter(Boolean)

    const allIds = [...new Set([bk.user_id, ...extraIds])]

    const studentProfiles = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(inArray(profiles.id, allIds), eq(profiles.role, 'student')))

    return studentProfiles.map((p) => p.id)
}

async function getBookingForNotif(bookingId: string) {
    const [data] = await db
        .select({
            id: bookings.id,
            start_time: bookings.start_time,
            user_id: bookings.user_id,
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))
    return data ?? null
}

async function applyPoints(studentIds: string[], delta: number): Promise<void> {
    if (studentIds.length === 0 || delta === 0) return
    await Promise.all(
        studentIds.map((id) =>
            db.execute(sql`SELECT update_student_points(${id}::uuid, ${delta}::integer)`)
        )
    )
}

async function freeBookingEquipment(bookingId: string): Promise<string[]> {
    const [bk] = await db
        .select({ equipment_ids: bookings.equipment_ids })
        .from(bookings)
        .where(eq(bookings.id, bookingId))

    const equipmentIds: string[] = bk?.equipment_ids || []
    if (equipmentIds.length > 0) {
        await db
            .update(equipment)
            .set({ is_available: true })
            .where(inArray(equipment.id, equipmentIds))
    }
    return equipmentIds
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export async function getCurrentBookings() {
    const now = new Date()
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

    const bookingRows = await db
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
            profiles: { full_name: profiles.full_name, role: profiles.role },
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(
            and(
                inArray(bookings.status, [
                    'pending_confirmation',
                    'confirmed',
                    'waiting_manager',
                    'active',
                ]),
                lte(bookings.start_time, next24h),
                or(
                    and(
                        eq(bookings.status, 'active'),
                        gte(bookings.end_time, oneHourAgo)
                    ),
                    gte(bookings.end_time, now)
                )
            )
        )
        .orderBy(asc(bookings.start_time))

    if (!bookingRows || bookingRows.length === 0) return []

    const allEquipmentIds = Array.from(
        new Set(bookingRows.flatMap((b) => b.equipment_ids || []))
    )

    const equipmentMap = new Map<string, string>()
    if (allEquipmentIds.length > 0) {
        const equipList = await db
            .select({ id: equipment.id, name: equipment.name })
            .from(equipment)
            .where(inArray(equipment.id, allEquipmentIds))
        equipList.forEach((eq_) => equipmentMap.set(eq_.id, eq_.name))
    }

    return bookingRows.map((b) => ({
        ...b,
        equipment_names: (b.equipment_ids || [])
            .map((id) => equipmentMap.get(id))
            .filter(Boolean),
    }))
}

export async function getUnderMaintenanceCourts() {
    const courtRows = await db
        .select()
        .from(courts)
        .where(or(eq(courts.is_active, false), isNotNull(courts.maintenance_notes)))

    const disabledCourts = courtRows.filter(
        (court) =>
            !court.is_active ||
            (court.maintenance_notes && court.maintenance_notes.trim() !== '')
    )

    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const maintenanceBookings = await db
        .select({
            id: bookings.id,
            court_id: bookings.court_id,
            start_time: bookings.start_time,
            end_time: bookings.end_time,
            courts: { id: courts.id, name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(
            and(
                eq(bookings.is_maintenance, true),
                ne(bookings.status, 'cancelled'),
                gte(bookings.start_time, startOfDay),
                lte(bookings.start_time, endOfDay)
            )
        )
        .orderBy(asc(bookings.start_time))

    const maintenanceBookingCourts = maintenanceBookings.map((b) => ({
        id: b.id,
        court_id: b.courts?.id,
        name: b.courts?.name ?? '',
        sport: b.courts?.sport ?? '',
        maintenance_notes: 'Scheduled Maintenance',
        start_time: b.start_time.toISOString(),
        end_time: b.end_time.toISOString(),
        is_active: true as const,
        is_booking_slot: true,
    }))

    const formattedDisabledCourts = disabledCourts.map((c) => ({
        ...c,
        is_booking_slot: false,
    }))

    return [...formattedDisabledCourts, ...maintenanceBookingCourts]
}

export async function getPendingBookings() {
    return await db
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
            profiles: {
                full_name: profiles.full_name,
                phone_number: profiles.phone_number,
                student_id: profiles.student_id,
            },
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.status, 'pending_confirmation'))
        .orderBy(asc(bookings.start_time))
}

export async function updateBookingStatus(
    bookingId: string,
    status: 'confirmed' | 'rejected' | 'active' | 'completed' | 'cancelled'
): Promise<{ success: boolean; error?: string }> {
    try {
        const terminalStatuses = ['cancelled', 'rejected', 'completed']
        let equipmentIds: string[] = []

        if (terminalStatuses.includes(status)) {
            const [bk] = await db
                .select({ equipment_ids: bookings.equipment_ids })
                .from(bookings)
                .where(eq(bookings.id, bookingId))
            equipmentIds = bk?.equipment_ids || []
        }

        const whereClause =
            status === 'active'
                ? and(
                      eq(bookings.id, bookingId),
                      notInArray(bookings.status, ['cancelled', 'completed', 'rejected'])
                  )
                : eq(bookings.id, bookingId)

        await db.update(bookings).set({ status }).where(whereClause)

        if (equipmentIds.length > 0) {
            await db
                .update(equipment)
                .set({ is_available: true })
                .where(inArray(equipment.id, equipmentIds))
        }

        if (status === 'active') {
            const bk = await getBookingForNotif(bookingId)
            if (bk) {
                const studentIds = await getBookingStudentIds(bookingId)
                const court = bk.courts
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
                        data: {
                            booking_id: bookingId,
                            court_name: court?.name,
                            sport: court?.sport,
                        },
                    }))
                )
            }
        }

        revalidatePath('/manager')
        revalidatePath('/admin/reservations')
        revalidatePath('/student')
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e?.message ?? 'Failed to update booking status' }
    }
}

export async function getBookingDetails(bookingId: string) {
    const [bk] = await db
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
            profiles: {
                id: profiles.id,
                full_name: profiles.full_name,
                email: profiles.email,
                phone_number: profiles.phone_number,
                student_id: profiles.student_id,
                role: profiles.role,
                branch: profiles.branch,
                gender: profiles.gender,
                year: profiles.year,
                points: profiles.points,
                banned_until: profiles.banned_until,
                avatar_url: profiles.avatar_url,
            },
            courts: { id: courts.id, name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))

    if (!bk) return null

    // Mutable local copy of status for lazy expiry
    let currentStatus = bk.status

    const now = new Date()
    const startTime = new Date(bk.start_time)
    const tenMinutesAfterStart = new Date(startTime.getTime() + 10 * 60 * 1000)

    const isPending = ['pending_confirmation', 'waiting_manager'].includes(currentStatus ?? '')
    if (isPending && now > tenMinutesAfterStart) {
        await freeBookingEquipment(bookingId)
        await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bookingId))
        currentStatus = 'cancelled'

        const rawList = Array.isArray(bk.players_list) ? bk.players_list : []
        const allPlayerIds = [
            bk.user_id,
            ...rawList
                .map((p: any) => (typeof p === 'string' ? p : p?.id))
                .filter(Boolean),
        ] as string[]

        if (allPlayerIds.length > 0) {
            const playerRows = await db
                .select({ id: profiles.id, role: profiles.role })
                .from(profiles)
                .where(inArray(profiles.id, allPlayerIds))
            const expiredStudentIds = playerRows
                .filter((p) => p.role === 'student')
                .map((p) => p.id)

            if (expiredStudentIds.length > 0) {
                await db.insert(studentViolations).values(
                    expiredStudentIds.map((id) => ({
                        student_id: id,
                        booking_id: bookingId,
                        violation_type: 'booking_timeout',
                        severity: 'minor' as const,
                        reason: 'Booking was not approved within 10 minutes of start time and was auto-cancelled.',
                    }))
                )
                await applyPoints(expiredStudentIds, -8)
                const bkNotif = await getBookingForNotif(bookingId)
                if (bkNotif) {
                    const court = bkNotif.courts
                    await sendNotifications(
                        expiredStudentIds.map((id) => ({
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

    // Fetch equipment details
    let equipmentList: any[] = []
    if (bk.equipment_ids && bk.equipment_ids.length > 0) {
        equipmentList = await db
            .select()
            .from(equipment)
            .where(inArray(equipment.id, bk.equipment_ids))
    }

    // Fetch all players
    const allPlayers: any[] = []
    allPlayers.push({ ...bk.profiles, is_booker: true })

    const rawPlayersList = Array.isArray(bk.players_list) ? bk.players_list : []
    const playerIds = rawPlayersList
        .map((entry: any) => (typeof entry === 'string' ? entry : entry?.id))
        .filter(Boolean)
    const additionalPlayerIds = playerIds.filter(
        (id: string) => id !== bk.profiles?.id
    )

    if (additionalPlayerIds.length > 0) {
        const extraPlayers = await db
            .select()
            .from(profiles)
            .where(inArray(profiles.id, additionalPlayerIds))
        allPlayers.push(...extraPlayers.map((p) => ({ ...p, is_booker: false })))
    }

    return {
        ...bk,
        status: currentStatus,
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

    const [bkData] = await db
        .select({ equipment_ids: bookings.equipment_ids })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
    const equipmentIds: string[] = bkData?.equipment_ids || []

    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bookingId))

    if (equipmentIds.length > 0) {
        await db
            .update(equipment)
            .set({ is_available: true })
            .where(inArray(equipment.id, equipmentIds))
    }

    const players = await db
        .select({ id: profiles.id, role: profiles.role })
        .from(profiles)
        .where(inArray(profiles.id, playerIds))

    const studentIds: string[] = players
        .filter((p) => p.role === 'student')
        .map((p) => p.id)

    if (studentIds.length > 0) {
        await db.insert(studentViolations).values(
            studentIds.map((studentId) => ({
                student_id: studentId,
                booking_id: bookingId,
                violation_type: reason,
                severity: 'minor' as const,
                reason: customReason || reason,
            }))
        )

        const pointsDelta = REJECTION_POINTS[reason] ?? 0
        if (pointsDelta !== 0) {
            await applyPoints(studentIds, pointsDelta)
        }

        if (reason === 'students_late') {
            const banResults = await Promise.all(
                studentIds.map(async (id) => {
                    const rows = await db.execute<{ check_and_apply_late_ban: string | null }>(
                        sql`SELECT check_and_apply_late_ban(${id}::uuid) as banned_until`
                    )
                    const banned_until = (rows as any)[0]?.banned_until as string | null
                    return { id, banned_until }
                })
            )
            const bannedResults = banResults.filter((r) => r.banned_until != null)
            if (bannedResults.length > 0) {
                await sendNotifications(
                    bannedResults.map(({ id, banned_until }) => {
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

    const bk = await getBookingForNotif(bookingId)
    if (bk && studentIds.length > 0) {
        const court = bk.courts
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

export async function emergencyEndSession(bookingId: string, reason: string) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const user = auth.user!

    await freeBookingEquipment(bookingId)

    await db.update(bookings).set({ status: 'completed' }).where(eq(bookings.id, bookingId))

    await db.insert(feedbackComplaints).values({
        student_id: user.id,
        booking_id: bookingId,
        title: 'Emergency Session End',
        description: reason,
        category: 'emergency_by_manager',
        status: 'open',
    })

    const studentIds = await getBookingStudentIds(bookingId)
    const bk = await getBookingForNotif(bookingId)
    if (bk) {
        const court = bk.courts
        if (studentIds.length > 0) {
            await sendNotifications(
                studentIds.map((id) => ({
                    recipientId: id,
                    type: 'session_ended_emergency',
                    title: 'Session Ended Early',
                    body: `Your ${court?.sport || ''} session at ${court?.name || 'court'} was ended early by the manager. Reason: ${reason}.`,
                    data: { booking_id: bookingId, reason },
                }))
            )
        }
        await notifyAdmins({
            type: 'emergency_alert',
            title: 'Emergency Session End',
            body: `Manager ended a ${court?.sport || ''} session early at ${court?.name || 'court'}. Reason: ${reason}.`,
            data: { booking_id: bookingId, reason },
        })
    }

    revalidatePath('/manager')
    revalidatePath('/admin/feedback')
    revalidatePath('/admin/reservations')
    return { success: true }
}

export async function updateEquipmentConditions(
    conditions: { id: string; condition: 'good' | 'minor_damage' | 'damaged' }[]
) {
    await Promise.all(
        conditions.map(({ id, condition }) =>
            db.update(equipment).set({ condition }).where(eq(equipment.id, id))
        )
    )
    return { success: true }
}

export async function reportLostEquipment(
    bookingId: string,
    equipmentIds: string[],
    playerIds: string[]
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }
    const user = auth.user!

    const items = await db
        .select({ id: equipment.id, name: equipment.name, equipment_id: equipment.equipment_id })
        .from(equipment)
        .where(inArray(equipment.id, equipmentIds))
    const names = items.map((i) => i.name).join(', ') || 'Unknown equipment'

    await db
        .update(equipment)
        .set({ is_available: false, condition: 'lost' })
        .where(inArray(equipment.id, equipmentIds))

    // Remove lost equipment from future bookings
    const now = new Date().toISOString()
    const futureBookings = await db
        .select({ id: bookings.id, user_id: bookings.user_id, equipment_ids: bookings.equipment_ids, start_time: bookings.start_time })
        .from(bookings)
        .where(
            and(
                gte(bookings.start_time, new Date(now)),
                ne(bookings.status, 'cancelled'),
                ne(bookings.status, 'rejected'),
                ne(bookings.status, 'completed')
            )
        )

    const impactedBookings = futureBookings.filter(
        (b) =>
            Array.isArray(b.equipment_ids) &&
            b.equipment_ids.some((eid) => equipmentIds.includes(eid))
    )

    for (const b of impactedBookings) {
        const updatedIds = (b.equipment_ids as string[]).filter(
            (eid) => !equipmentIds.includes(eid)
        )
        await db.update(bookings).set({ equipment_ids: updatedIds }).where(eq(bookings.id, b.id))
    }

    if (playerIds.length > 0) {
        await db.insert(studentViolations).values(
            playerIds.map((playerId) => ({
                student_id: playerId,
                booking_id: bookingId,
                violation_type: 'lost_equipment',
                severity: 'severe' as const,
                reason: `Equipment lost during booking: ${names}`,
                reported_by: user.id,
            }))
        )

        const studentProfiles = await db
            .select({ id: profiles.id })
            .from(profiles)
            .where(and(inArray(profiles.id, playerIds), eq(profiles.role, 'student')))
        const studentIds = studentProfiles.map((p) => p.id)
        await applyPoints(studentIds, -20)

        if (studentIds.length > 0) {
            await sendNotifications(
                studentIds.map((id) => ({
                    recipientId: id,
                    type: 'equipment_lost',
                    title: 'Equipment Lost — Severe Violation',
                    body: `Equipment lost during your booking (${names}) has been reported. −20 pts. This has been flagged to admin.`,
                    data: { booking_id: bookingId, equipment: names, points_delta: -20 },
                }))
            )
        }
        await notifyAdmins({
            type: 'equipment_incident',
            title: 'Equipment Reported Lost',
            body: `Equipment reported lost: ${names}. All players have been penalised (−20 pts each).`,
            data: { booking_id: bookingId, equipment: names },
        })
    }

    revalidatePath('/admin/defaulters')
    revalidatePath('/admin/equipment')
    revalidatePath('/admin/reservations')
    revalidatePath('/student')
    revalidatePath('/student/profile')
    return { success: true, impactedBookingsCount: impactedBookings.length }
}

export async function reportStudentPostSession(
    bookingId: string,
    studentId: string,
    reason: string,
    customReason: string | null
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }

    const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, studentId))
    if (!profile || profile.role !== 'student') return { error: 'Target user is not a student' }

    await db.insert(studentViolations).values({
        student_id: studentId,
        booking_id: bookingId,
        violation_type: reason,
        severity: 'minor',
        reason: customReason || reason,
    })

    const pointsDelta = POST_SESSION_POINTS[reason] ?? 0
    if (pointsDelta !== 0) {
        await applyPoints([studentId], pointsDelta)
    }

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

export async function endSession(
    bookingId: string,
    equipmentConditions: { id: string; condition: 'good' | 'minor_damage' | 'damaged' }[]
) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }

    // Atomically mark completed — prevent double-award on concurrent calls
    const markedRows = await db
        .update(bookings)
        .set({ status: 'completed' })
        .where(and(eq(bookings.id, bookingId), ne(bookings.status, 'completed')))
        .returning({ id: bookings.id })

    if (!markedRows || markedRows.length === 0) return { already_handled: true }

    // Update equipment conditions + free them
    for (const { id, condition } of equipmentConditions) {
        const [equip] = await db
            .select({ total_usage_count: equipment.total_usage_count })
            .from(equipment)
            .where(eq(equipment.id, id))

        await db
            .update(equipment)
            .set({
                condition,
                is_available: true,
                total_usage_count: (equip?.total_usage_count || 0) + 1,
            })
            .where(eq(equipment.id, id))
    }

    if (equipmentConditions.length === 0) {
        await freeBookingEquipment(bookingId)
    }

    // Award points
    const studentIds = await getBookingStudentIds(bookingId)
    if (studentIds.length > 0) {
        let delta = 8
        if (equipmentConditions.length > 0) {
            const hasDamaged = equipmentConditions.some((e) => e.condition === 'damaged')
            const hasMinorDmg = equipmentConditions.some((e) => e.condition === 'minor_damage')
            if (hasDamaged) delta += -8
            else if (hasMinorDmg) delta += -1
            else delta += 2
        }
        await applyPoints(studentIds, delta)

        const bk = await getBookingForNotif(bookingId)
        if (bk) {
            const court = bk.courts
            const hasDamaged = equipmentConditions.some((e) => e.condition === 'damaged')
            const hasMinorDmg = equipmentConditions.some((e) => e.condition === 'minor_damage')
            const equipDelta = hasDamaged ? -8 : hasMinorDmg ? -1 : equipmentConditions.length > 0 ? 2 : 0
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

export async function expireBooking(bookingId: string, playerIds: string[]) {
    const auth = await requireManagerRole()
    if (auth.error) return { error: auth.error }

    const [bk] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, bookingId))

    if (
        !bk ||
        ['cancelled', 'rejected', 'completed', 'active'].includes(bk.status ?? '')
    ) {
        return { already_handled: true }
    }

    await freeBookingEquipment(bookingId)
    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bookingId))

    if (playerIds.length > 0) {
        const players = await db
            .select({ id: profiles.id, role: profiles.role })
            .from(profiles)
            .where(inArray(profiles.id, playerIds))
        const studentIds: string[] = players
            .filter((p) => p.role === 'student')
            .map((p) => p.id)

        if (studentIds.length > 0) {
            await db.insert(studentViolations).values(
                studentIds.map((studentId) => ({
                    student_id: studentId,
                    booking_id: bookingId,
                    violation_type: 'booking_timeout',
                    severity: 'minor' as const,
                    reason: 'Booking was not approved within 10 minutes of start time and was auto-cancelled.',
                }))
            )

            await applyPoints(studentIds, -8)

            const bkExp = await getBookingForNotif(bookingId)
            if (bkExp) {
                const court = bkExp.courts
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
