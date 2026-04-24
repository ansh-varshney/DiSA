'use server'

import { db } from '@/db'
import {
    profiles,
    courts,
    equipment,
    bookings,
    announcements,
    feedbackComplaints,
    coordinators,
    studentViolations,
} from '@/db/schema'
import { getCurrentUser } from '@/lib/session'
import { uploadFile, deleteFile } from '@/lib/storage'
import { generateCourtId, generateEquipmentId } from '@/lib/sports'
import {
    sendNotification,
    sendNotifications,
    broadcastToAllStudents,
} from '@/actions/notifications'
import {
    eq, ne, and, or, gte, lte, lt, asc, desc, inArray, notInArray, isNull, sql, count,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { revalidatePath } from 'next/cache'

//============================================
// Authorization Helper
//============================================

async function verifyAdmin() {
    const user = await getCurrentUser()
    if (!user) throw new Error('Unauthorized: No user logged in')

    const [profile] = await db
        .select({ role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, user.id))

    if (!profile || (profile.role !== 'admin' && profile.role !== 'superuser')) {
        throw new Error('Forbidden: Admin access required')
    }

    return { user }
}

//============================================
// Equipment Management
//============================================

export async function getEquipmentList(sport?: string) {
    await verifyAdmin()
    const whereClause =
        sport && sport !== 'all' ? eq(equipment.sport, sport) : undefined

    return await db
        .select()
        .from(equipment)
        .where(whereClause)
        .orderBy(desc(equipment.created_at))
}

export async function createEquipment(formData: FormData) {
    await verifyAdmin()

    const imageFiles = formData.getAll('images') as File[]
    const sport = formData.get('sport') as string

    if (!sport) throw new Error('Sport is required')

    const [{ equipCount }] = await db
        .select({ equipCount: sql<number>`cast(count(*) as integer)` })
        .from(equipment)
        .where(eq(equipment.sport, sport))

    const equipmentId = generateEquipmentId(sport, equipCount || 0)

    const [newEquipment] = await db
        .insert(equipment)
        .values({
            name: formData.get('name') as string,
            sport,
            condition: ((formData.get('condition') as string) || 'good') as any,
            vendor_name: (formData.get('vendor_name') as string) || null,
            cost: formData.get('cost') ? (formData.get('cost') as string) : null,
            purchase_date: (formData.get('purchase_date') as string) || null,
            expected_lifespan_days: 365,
            is_available: true,
            total_usage_count: 0,
            pictures: [],
            notes: (formData.get('notes') as string) || '',
            equipment_id: equipmentId,
        })
        .returning()

    if (!newEquipment) throw new Error('Failed to create equipment')

    // Upload images
    if (imageFiles.length > 0) {
        const uploadedUrls: string[] = []
        for (const file of imageFiles) {
            const url = await uploadFile(file, `equipment-images/${sport}/${newEquipment.id}`)
            if (url) uploadedUrls.push(url)
        }
        if (uploadedUrls.length > 0) {
            await db
                .update(equipment)
                .set({ pictures: uploadedUrls })
                .where(eq(equipment.id, newEquipment.id))
        }
    }

    revalidatePath('/admin/equipment')
    return newEquipment
}

export async function updateEquipment(id: string, formData: FormData) {
    await verifyAdmin()

    const [existing] = await db
        .select({ pictures: equipment.pictures, sport: equipment.sport })
        .from(equipment)
        .where(eq(equipment.id, id))

    const existingImages: string[] = JSON.parse(
        (formData.get('existingImages') as string) || '[]'
    )
    const newImageFiles = formData.getAll('images') as File[]
    const uploadedUrls: string[] = [...existingImages]

    // Upload new images
    for (const file of newImageFiles) {
        const url = await uploadFile(
            file,
            `equipment-images/${existing?.sport || 'unknown'}/${id}`
        )
        if (url) uploadedUrls.push(url)
    }

    // Delete removed images
    const removedImages = (existing?.pictures || []).filter(
        (url) => !existingImages.includes(url)
    )
    for (const url of removedImages) {
        await deleteFile(url)
    }

    const [updated] = await db
        .update(equipment)
        .set({
            name: formData.get('name') as string,
            sport: formData.get('sport') as string,
            condition: (formData.get('condition') as string) as any,
            vendor_name: (formData.get('vendor_name') as string) || null,
            cost: formData.get('cost') ? (formData.get('cost') as string) : null,
            purchase_date: (formData.get('purchase_date') as string) || null,
            pictures: uploadedUrls,
            notes: (formData.get('notes') as string) || '',
        })
        .where(eq(equipment.id, id))
        .returning()

    if (!updated) throw new Error('Failed to update equipment')

    revalidatePath('/admin/equipment')
    return updated
}

export async function deleteEquipment(id: string) {
    await verifyAdmin()

    const [item] = await db
        .select({ pictures: equipment.pictures })
        .from(equipment)
        .where(eq(equipment.id, id))

    // Soft-delete: mark retired to preserve booking history
    await db.update(equipment).set({ condition: 'retired' }).where(eq(equipment.id, id))

    for (const url of item?.pictures || []) {
        await deleteFile(url)
    }

    revalidatePath('/admin/equipment')
    return { success: true }
}

//============================================
// Court Management
//============================================

export async function getCourtsList(sport?: string) {
    const whereClause =
        sport && sport !== 'all' ? eq(courts.sport, sport) : undefined

    return await db
        .select()
        .from(courts)
        .where(whereClause)
        .orderBy(desc(courts.created_at))
}

export async function createCourt(formData: FormData) {
    await verifyAdmin()

    const sport = formData.get('sport') as string
    if (!sport) throw new Error('Sport is required')

    const imageFiles = formData.getAll('images') as File[]

    const [{ courtCount }] = await db
        .select({ courtCount: sql<number>`cast(count(*) as integer)` })
        .from(courts)
        .where(eq(courts.sport, sport))

    const courtId = generateCourtId(sport, courtCount || 0)

    const [newCourt] = await db
        .insert(courts)
        .values({
            name: formData.get('name') as string,
            sport,
            condition: ((formData.get('condition') as string) || 'good') as any,
            last_maintenance_date: (formData.get('last_maintenance_date') as string) || null,
            next_check_date: (formData.get('next_check_date') as string) || null,
            is_active: true,
            usage_count: 0,
            pictures: [],
            notes: (formData.get('notes') as string) || '',
            court_id: courtId,
        })
        .returning()

    if (!newCourt)
        throw new Error('Failed to create court')

    // Upload images
    if (imageFiles.length > 0) {
        const uploadedUrls: string[] = []
        for (const file of imageFiles) {
            const url = await uploadFile(file, `court-images/${sport}/${newCourt.id}`)
            if (url) uploadedUrls.push(url)
        }
        if (uploadedUrls.length > 0) {
            await db
                .update(courts)
                .set({ pictures: uploadedUrls })
                .where(eq(courts.id, newCourt.id))
        }
    }

    revalidatePath('/admin/courts')
    return newCourt
}

export async function updateCourt(id: string, formData: FormData) {
    await verifyAdmin()

    const [existing] = await db
        .select({ pictures: courts.pictures, sport: courts.sport })
        .from(courts)
        .where(eq(courts.id, id))

    const existingImages: string[] = JSON.parse(
        (formData.get('existingImages') as string) || '[]'
    )
    const newImageFiles = formData.getAll('images') as File[]
    const uploadedUrls: string[] = [...existingImages]

    for (const file of newImageFiles) {
        const url = await uploadFile(
            file,
            `court-images/${existing?.sport || 'unknown'}/${id}`
        )
        if (url) uploadedUrls.push(url)
    }

    const removedImages = (existing?.pictures || []).filter(
        (url) => !existingImages.includes(url)
    )
    for (const url of removedImages) {
        await deleteFile(url)
    }

    const [updated] = await db
        .update(courts)
        .set({
            name: formData.get('name') as string,
            condition: (formData.get('condition') as string) as any,
            last_maintenance_date: (formData.get('last_maintenance_date') as string) || null,
            next_check_date: (formData.get('next_check_date') as string) || null,
            pictures: uploadedUrls,
            notes: (formData.get('notes') as string) || '',
        })
        .where(eq(courts.id, id))
        .returning()

    if (!updated) throw new Error('Failed to update court')

    revalidatePath('/admin/courts')
    return updated
}

export async function deleteCourt(id: string) {
    await verifyAdmin()

    const [court] = await db
        .select({ pictures: courts.pictures })
        .from(courts)
        .where(eq(courts.id, id))

    for (const url of court?.pictures || []) {
        await deleteFile(url)
    }

    // Soft-delete: preserve booking history
    const [updated] = await db
        .update(courts)
        .set({ is_active: false })
        .where(eq(courts.id, id))
        .returning()

    if (!updated) throw new Error('Failed to delete court')

    revalidatePath('/admin/courts')
    return updated
}

//============================================
// Announcements Management
//============================================

export async function getAnnouncements() {
    return await db
        .select({
            id: announcements.id,
            title: announcements.title,
            content: announcements.content,
            created_by: announcements.created_by,
            created_at: announcements.created_at,
            profiles: { full_name: profiles.full_name },
        })
        .from(announcements)
        .leftJoin(profiles, eq(announcements.created_by, profiles.id))
        .orderBy(desc(announcements.created_at))
}

export async function createAnnouncement(title: string, content: string) {
    const { user } = await verifyAdmin()

    const [data] = await db
        .insert(announcements)
        .values({ title, content, created_by: user.id })
        .returning()

    if (!data) throw new Error('Failed to create announcement')

    await broadcastToAllStudents({
        type: 'announcement',
        title: `Announcement: ${title}`,
        body: content.length > 120 ? content.slice(0, 117) + '…' : content,
        data: { announcement_id: data.id },
    })

    revalidatePath('/admin/announcements')
    revalidatePath('/student')
    return data
}

export async function updateAnnouncement(id: string, title: string, content: string) {
    await verifyAdmin()

    const [data] = await db
        .update(announcements)
        .set({ title, content })
        .where(eq(announcements.id, id))
        .returning()

    if (!data) throw new Error('Failed to update announcement')

    revalidatePath('/admin/announcements')
    revalidatePath('/student')
    return data
}

export async function deleteAnnouncement(id: string) {
    await verifyAdmin()
    await db.delete(announcements).where(eq(announcements.id, id))
    revalidatePath('/admin/announcements')
    revalidatePath('/student')
    return { success: true }
}

//============================================
// Reservations
//============================================

export async function getReservations(days: number = 3) {
    const now = new Date()
    const futureDate = new Date()
    futureDate.setDate(now.getDate() + days)

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
            courts: {
                id: courts.id,
                name: courts.name,
                sport: courts.sport,
                type: courts.type,
                capacity: courts.capacity,
                is_active: courts.is_active,
                condition: courts.condition,
            },
            profiles: { full_name: profiles.full_name, student_id: profiles.student_id },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .where(
            and(
                gte(bookings.start_time, now),
                lte(bookings.start_time, futureDate),
                ne(bookings.status, 'cancelled'),
                ne(bookings.status, 'rejected')
            )
        )
        .orderBy(asc(bookings.start_time))
}

export async function getReservationsByDate(sport: string, date: string) {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

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
            courts: { id: courts.id, name: courts.name, sport: courts.sport },
            profiles: { full_name: profiles.full_name, student_id: profiles.student_id },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .where(
            and(
                eq(courts.sport, sport),
                gte(bookings.start_time, startOfDay),
                lte(bookings.start_time, endOfDay),
                ne(bookings.status, 'cancelled'),
                ne(bookings.status, 'rejected')
            )
        )
        .orderBy(asc(bookings.start_time))
}

export async function cancelReservation(bookingId: string) {
    await verifyAdmin()

    const [booking] = await db
        .select({
            user_id: bookings.user_id,
            players_list: bookings.players_list,
            start_time: bookings.start_time,
            is_priority: bookings.is_priority,
            is_maintenance: bookings.is_maintenance,
            courts: { name: courts.name },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))

    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bookingId))

    if (booking && !booking.is_priority && !booking.is_maintenance) {
        const courtName = booking.courts?.name || 'the court'
        const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        const confirmedIds = new Set<string>()
        confirmedIds.add(booking.user_id)
        const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
        for (const p of playersList) {
            const pid = typeof p === 'string' ? p : p.id
            const status = typeof p === 'string' ? undefined : p.status
            if (!status || status === 'confirmed') confirmedIds.add(pid)
        }

        await sendNotifications(
            Array.from(confirmedIds).map((pid) => ({
                recipientId: pid,
                type: 'force_cancelled',
                title: 'Booking Cancelled by Admin',
                body: `Your booking for ${courtName} on ${startDisplay} has been cancelled by the admin.`,
                data: { booking_id: bookingId, court_name: courtName },
            }))
        )
    }

    revalidatePath('/admin/reservations')
    return { success: true }
}

export async function priorityReserveSlot(
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
    numPlayers: number = 2,
    equipmentIds: string[] = []
) {
    const { user } = await verifyAdmin()

    const startDateTime = new Date(`${date}T${startTime}:00`)
    const endDateTime = new Date(`${date}T${endTime}:00`)

    const conflicting = await db
        .select({
            id: bookings.id,
            user_id: bookings.user_id,
            players_list: bookings.players_list,
            start_time: bookings.start_time,
            courts: { name: courts.name, sport: courts.sport },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(
            and(
                eq(bookings.court_id, courtId),
                gte(bookings.start_time, startDateTime),
                lt(bookings.start_time, endDateTime),
                notInArray(bookings.status, ['cancelled', 'rejected', 'completed']),
                eq(bookings.is_priority, false),
                eq(bookings.is_maintenance, false)
            )
        )

    const notifBatch: Array<{
        recipientId: string
        type: string
        title: string
        body: string
        data: Record<string, any>
    }> = []

    if (conflicting.length > 0) {
        const courtName = conflicting[0].courts?.name || 'the court'
        const startDisplay = startDateTime.toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        for (const bk of conflicting) {
            await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bk.id))

            const playersList = Array.isArray(bk.players_list) ? bk.players_list : []
            const confirmedIds = new Set<string>()
            confirmedIds.add(bk.user_id)
            for (const p of playersList) {
                const pid = typeof p === 'string' ? p : p.id
                const status = typeof p === 'string' ? undefined : p.status
                if (!status || status === 'confirmed') confirmedIds.add(pid)
            }

            for (const pid of confirmedIds) {
                notifBatch.push({
                    recipientId: pid,
                    type: 'priority_reserve_cancelled',
                    title: 'Booking Cancelled — Priority Reserve',
                    body: `Your booking for ${courtName} on ${startDisplay} has been cancelled due to a priority reservation by the admin.`,
                    data: { booking_id: bk.id, court_name: courtName },
                })
            }
        }

        if (notifBatch.length > 0) await sendNotifications(notifBatch)
    }

    const [data] = await db
        .insert(bookings)
        .values({
            court_id: courtId,
            user_id: user.id,
            start_time: startDateTime,
            end_time: endDateTime,
            status: 'confirmed',
            is_priority: true,
            num_players: numPlayers,
            equipment_ids: equipmentIds,
        })
        .returning()

    if (!data) throw new Error('Failed to create priority reservation')

    revalidatePath('/admin/reservations')
    return data
}

export async function reserveForMaintenance(
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
    numPlayers: number = 2,
    equipmentIds: string[] = []
) {
    const { user } = await verifyAdmin()

    const startDateTime = new Date(`${date}T${startTime}:00`)
    const endDateTime = new Date(`${date}T${endTime}:00`)

    const conflicting = await db
        .select({
            id: bookings.id,
            user_id: bookings.user_id,
            players_list: bookings.players_list,
            courts: { name: courts.name },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(
            and(
                eq(bookings.court_id, courtId),
                gte(bookings.start_time, startDateTime),
                lt(bookings.start_time, endDateTime),
                notInArray(bookings.status, ['cancelled', 'rejected', 'completed']),
                eq(bookings.is_priority, false),
                eq(bookings.is_maintenance, false)
            )
        )

    const notifBatch: Array<{
        recipientId: string
        type: string
        title: string
        body: string
        data: Record<string, any>
    }> = []

    if (conflicting.length > 0) {
        const courtName = conflicting[0].courts?.name || 'the court'
        const startDisplay = startDateTime.toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        for (const bk of conflicting) {
            await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, bk.id))

            const playersList = Array.isArray(bk.players_list) ? bk.players_list : []
            const confirmedIds = new Set<string>()
            confirmedIds.add(bk.user_id)
            for (const p of playersList) {
                const pid = typeof p === 'string' ? p : p.id
                const status = typeof p === 'string' ? undefined : p.status
                if (!status || status === 'confirmed') confirmedIds.add(pid)
            }

            for (const pid of confirmedIds) {
                notifBatch.push({
                    recipientId: pid,
                    type: 'maintenance_cancelled',
                    title: 'Booking Cancelled — Court Maintenance',
                    body: `Your booking for ${courtName} on ${startDisplay} has been cancelled due to scheduled maintenance.`,
                    data: { booking_id: bk.id, court_name: courtName },
                })
            }
        }

        if (notifBatch.length > 0) await sendNotifications(notifBatch)
    }

    const [data] = await db
        .insert(bookings)
        .values({
            court_id: courtId,
            user_id: user.id,
            start_time: startDateTime,
            end_time: endDateTime,
            status: 'confirmed',
            is_maintenance: true,
            num_players: numPlayers,
            equipment_ids: equipmentIds,
        })
        .returning()

    if (!data) throw new Error('Failed to create maintenance reservation')

    revalidatePath('/admin/reservations')
    return data
}

export async function getEquipmentBySport(sport: string) {
    return await db
        .select({
            id: equipment.id,
            name: equipment.name,
            equipment_id: equipment.equipment_id,
            sport: equipment.sport,
            condition: equipment.condition,
        })
        .from(equipment)
        .where(
            and(
                eq(equipment.sport, sport),
                notInArray(equipment.condition, ['lost', 'retired'])
            )
        )
        .orderBy(asc(equipment.name))
}

export async function forceCancelBooking(bookingId: string) {
    await verifyAdmin()

    const [booking] = await db
        .select({
            user_id: bookings.user_id,
            players_list: bookings.players_list,
            start_time: bookings.start_time,
            is_priority: bookings.is_priority,
            is_maintenance: bookings.is_maintenance,
            courts: { name: courts.name },
        })
        .from(bookings)
        .leftJoin(courts, eq(bookings.court_id, courts.id))
        .where(eq(bookings.id, bookingId))

    const [data] = await db
        .update(bookings)
        .set({ status: 'cancelled' })
        .where(eq(bookings.id, bookingId))
        .returning()

    if (!data) throw new Error('Failed to cancel booking')

    if (booking && !booking.is_priority && !booking.is_maintenance) {
        const courtName = booking.courts?.name || 'the court'
        const startDisplay = new Date(booking.start_time).toLocaleString('en-IN', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })

        const confirmedIds = new Set<string>()
        confirmedIds.add(booking.user_id)
        const playersList = Array.isArray(booking.players_list) ? booking.players_list : []
        for (const p of playersList) {
            const pid = typeof p === 'string' ? p : p.id
            const status = typeof p === 'string' ? undefined : p.status
            if (!status || status === 'confirmed') confirmedIds.add(pid)
        }

        await sendNotifications(
            Array.from(confirmedIds).map((pid) => ({
                recipientId: pid,
                type: 'force_cancelled',
                title: 'Booking Cancelled by Admin',
                body: `Your booking for ${courtName} on ${startDisplay} has been cancelled by the admin.`,
                data: { booking_id: bookingId, court_name: courtName },
            }))
        )
    }

    revalidatePath('/admin/reservations')
    return data
}

//============================================
// Booking Logs
//============================================

export async function getBookingLogs(sport: string, date: string) {
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const courtRows = await db
        .select({ id: courts.id, name: courts.name, sport: courts.sport })
        .from(courts)
        .where(eq(courts.sport, sport))

    if (!courtRows || courtRows.length === 0) return []

    const courtIds = courtRows.map((c) => c.id)
    const courtMap: Record<string, { name: string; sport: string }> = Object.fromEntries(
        courtRows.map((c) => [c.id, { name: c.name, sport: c.sport }])
    )

    const bookingRows = await db
        .select({
            id: bookings.id,
            status: bookings.status,
            start_time: bookings.start_time,
            end_time: bookings.end_time,
            num_players: bookings.num_players,
            equipment_ids: bookings.equipment_ids,
            players_list: bookings.players_list,
            is_priority: bookings.is_priority,
            is_maintenance: bookings.is_maintenance,
            created_at: bookings.created_at,
            court_id: bookings.court_id,
            profiles: {
                full_name: profiles.full_name,
                student_id: profiles.student_id,
                email: profiles.email,
            },
        })
        .from(bookings)
        .leftJoin(profiles, eq(bookings.user_id, profiles.id))
        .where(
            and(
                inArray(bookings.court_id, courtIds),
                gte(bookings.start_time, startOfDay),
                lte(bookings.start_time, endOfDay)
            )
        )
        .orderBy(asc(bookings.start_time))

    if (!bookingRows || bookingRows.length === 0) return []

    const allEquipmentIds = [
        ...new Set(bookingRows.flatMap((b) => b.equipment_ids || [])),
    ]

    let equipmentMap: Record<string, { id: string; name: string; condition: string }> = {}
    if (allEquipmentIds.length > 0) {
        const equipmentData = await db
            .select({ id: equipment.id, name: equipment.name, condition: equipment.condition })
            .from(equipment)
            .where(inArray(equipment.id, allEquipmentIds))

        equipmentMap = Object.fromEntries(
            equipmentData.map((e) => [e.id, { id: e.id, name: e.name, condition: e.condition as string }])
        )
    }

    return bookingRows.map((b) => ({
        ...b,
        courts: courtMap[b.court_id] || null,
        equipment: (b.equipment_ids || []).map((eid) => equipmentMap[eid]).filter(Boolean),
    }))
}

//============================================
// Feedback & Complaints
//============================================

export async function getFeedback(statusFilter?: string, categoryFilter?: string) {
    const studentProfileAlias = alias(profiles, 'student_profile')

    const conditions = []
    if (statusFilter && statusFilter !== 'all') conditions.push(eq(feedbackComplaints.status, statusFilter as any))
    if (categoryFilter && categoryFilter !== 'all') conditions.push(eq(feedbackComplaints.category, categoryFilter))

    return await db
        .select({
            id: feedbackComplaints.id,
            title: feedbackComplaints.title,
            description: feedbackComplaints.description,
            status: feedbackComplaints.status,
            category: feedbackComplaints.category,
            booking_id: feedbackComplaints.booking_id,
            student_id: feedbackComplaints.student_id,
            resolved_by: feedbackComplaints.resolved_by,
            resolved_at: feedbackComplaints.resolved_at,
            created_at: feedbackComplaints.created_at,
            profiles: {
                full_name: studentProfileAlias.full_name,
                student_id: studentProfileAlias.student_id,
            },
        })
        .from(feedbackComplaints)
        .leftJoin(studentProfileAlias, eq(feedbackComplaints.student_id, studentProfileAlias.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(feedbackComplaints.created_at))
}

export async function markFeedbackAsRead(feedbackId: string) {
    await db.delete(feedbackComplaints).where(eq(feedbackComplaints.id, feedbackId))
    revalidatePath('/admin/feedback')
    return { success: true }
}

export async function updateComplaintStatus(id: string, status: string) {
    const { user } = await verifyAdmin()

    const updates: Record<string, any> = { status }
    if (status === 'resolved') {
        updates.resolved_by = user.id
        updates.resolved_at = new Date()
    }

    const [data] = await db
        .update(feedbackComplaints)
        .set(updates)
        .where(eq(feedbackComplaints.id, id))
        .returning()

    if (!data) throw new Error('Failed to update complaint status')

    revalidatePath('/admin/feedback')
    return data
}

//============================================
// Coordinators
//============================================

export async function getCoordinators(sport?: string) {
    const whereClause =
        sport && sport !== 'all' ? eq(coordinators.sport, sport) : undefined

    return await db
        .select()
        .from(coordinators)
        .where(whereClause)
        .orderBy(desc(coordinators.created_at))
}

export async function createCoordinator(formData: FormData) {
    await verifyAdmin()

    const [data] = await db
        .insert(coordinators)
        .values({
            name: formData.get('name') as string,
            role: formData.get('role') as string,
            sport: formData.get('sport') as string,
            email: (formData.get('email') as string) || null,
            phone: (formData.get('phone') as string) || null,
            notes: (formData.get('notes') as string) || null,
        })
        .returning()

    if (!data) throw new Error('Failed to create coordinator')

    revalidatePath('/admin/coordinators')
    return data
}

export async function updateCoordinator(id: string, formData: FormData) {
    await verifyAdmin()

    const [data] = await db
        .update(coordinators)
        .set({
            name: formData.get('name') as string,
            role: formData.get('role') as string,
            sport: formData.get('sport') as string,
            email: (formData.get('email') as string) || null,
            phone: (formData.get('phone') as string) || null,
            notes: (formData.get('notes') as string) || null,
        })
        .where(eq(coordinators.id, id))
        .returning()

    if (!data) throw new Error('Failed to update coordinator')

    revalidatePath('/admin/coordinators')
    return data
}

export async function deleteCoordinator(id: string) {
    await verifyAdmin()
    await db.delete(coordinators).where(eq(coordinators.id, id))
    revalidatePath('/admin/coordinators')
    return { success: true }
}

//============================================
// Violations
//============================================

export async function getViolations(filters?: {
    severity?: string
    violationType?: string
}) {
    const studentAlias = alias(profiles, 'student_alias')
    const reporterAlias = alias(profiles, 'reporter_alias')

    const conditions = []
    if (filters?.severity && filters.severity !== 'all')
        conditions.push(eq(studentViolations.severity, filters.severity as any))
    if (filters?.violationType && filters.violationType !== 'all')
        conditions.push(eq(studentViolations.violation_type, filters.violationType))

    return await db
        .select({
            id: studentViolations.id,
            student_id: studentViolations.student_id,
            violation_type: studentViolations.violation_type,
            severity: studentViolations.severity,
            reason: studentViolations.reason,
            reported_by: studentViolations.reported_by,
            points_deducted: studentViolations.points_deducted,
            booking_id: studentViolations.booking_id,
            created_at: studentViolations.created_at,
            profiles: {
                full_name: studentAlias.full_name,
                student_id: studentAlias.student_id,
            },
            reported_by_profile: { full_name: reporterAlias.full_name },
        })
        .from(studentViolations)
        .leftJoin(studentAlias, eq(studentViolations.student_id, studentAlias.id))
        .leftJoin(reporterAlias, eq(studentViolations.reported_by, reporterAlias.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(studentViolations.created_at))
}

export async function getDefaulterStudents() {
    await verifyAdmin()
    const studentAlias = alias(profiles, 'student_alias')
    const reporterAlias = alias(profiles, 'reporter_alias')

    const rows = await db
        .select({
            id: studentViolations.id,
            student_id: studentViolations.student_id,
            violation_type: studentViolations.violation_type,
            severity: studentViolations.severity,
            reason: studentViolations.reason,
            reported_by: studentViolations.reported_by,
            created_at: studentViolations.created_at,
            profile_full_name: studentAlias.full_name,
            profile_student_id: studentAlias.student_id,
            profile_email: studentAlias.email,
            profile_phone_number: studentAlias.phone_number,
            profile_banned_until: studentAlias.banned_until,
        })
        .from(studentViolations)
        .leftJoin(studentAlias, eq(studentViolations.student_id, studentAlias.id))
        .orderBy(desc(studentViolations.created_at))

    if (!rows || rows.length === 0) return []

    const studentMap = new Map<
        string,
        {
            student_id: string
            student_name: string
            student_roll: string
            student_email: string
            student_phone: string
            banned_until: string | null
            total_violations: number
            late_arrival_count: number
            latest_reason: string
            latest_violation_type: string
            latest_source: 'system' | 'manager'
            latest_date: string
            violations: any[]
        }
    >()

    rows.forEach((row) => {
        const sid = row.student_id
        if (!studentMap.has(sid)) {
            studentMap.set(sid, {
                student_id: sid,
                student_name: row.profile_full_name || 'Unknown',
                student_roll: row.profile_student_id || '-',
                student_email: row.profile_email || '',
                student_phone: row.profile_phone_number || '',
                banned_until: row.profile_banned_until
                    ? row.profile_banned_until.toISOString()
                    : null,
                total_violations: 0,
                late_arrival_count: 0,
                latest_reason: row.reason || 'No reason provided',
                latest_violation_type: row.violation_type || 'other',
                latest_source: row.reported_by ? 'manager' : 'system',
                latest_date: row.created_at.toISOString(),
                violations: [],
            })
        }

        const student = studentMap.get(sid)!
        student.total_violations++
        if (row.violation_type === 'students_late') {
            student.late_arrival_count++
        }
        student.violations.push(row)
    })

    return Array.from(studentMap.values()).sort(
        (a, b) => new Date(b.latest_date).getTime() - new Date(a.latest_date).getTime()
    )
}

export async function removeStudentFromDefaulters(studentId: string) {
    await verifyAdmin()

    await db.execute(sql`SELECT clear_student_defaulter(${studentId}::uuid)`)

    await sendNotification({
        recipientId: studentId,
        type: 'defaulter_cleared',
        title: 'Record Cleared by Admin',
        body: 'Your violation record and any active booking ban have been cleared by an admin. You can book again.',
        data: {},
    })

    revalidatePath('/admin/defaulters')
    revalidatePath('/student/profile')
    return { success: true }
}

export async function adjustStudentPoints(studentId: string, delta: number) {
    await verifyAdmin()

    await db.execute(sql`SELECT update_student_points(${studentId}::uuid, ${delta}::integer)`)

    const sign = delta >= 0 ? '+' : ''
    await sendNotification({
        recipientId: studentId,
        type: 'points_adjusted',
        title: 'Points Adjusted by Admin',
        body: `An admin has manually adjusted your points (${sign}${delta} pts).`,
        data: { delta },
    })

    revalidatePath('/admin/defaulters')
    revalidatePath('/admin/analytics/student-welfare/leaderboard')
    return { success: true }
}

export async function getStudentViolationHistory(studentId: string) {
    const reporterAlias = alias(profiles, 'reporter_alias')

    return await db
        .select({
            id: studentViolations.id,
            student_id: studentViolations.student_id,
            violation_type: studentViolations.violation_type,
            severity: studentViolations.severity,
            reason: studentViolations.reason,
            reported_by: studentViolations.reported_by,
            points_deducted: studentViolations.points_deducted,
            booking_id: studentViolations.booking_id,
            created_at: studentViolations.created_at,
            reported_by_profile: { full_name: reporterAlias.full_name },
        })
        .from(studentViolations)
        .leftJoin(reporterAlias, eq(studentViolations.reported_by, reporterAlias.id))
        .where(eq(studentViolations.student_id, studentId))
        .orderBy(desc(studentViolations.created_at))
}

//============================================
// Dashboard Stats
//============================================

export async function getDashboardStats() {
    await verifyAdmin()
    const today = new Date().toISOString().split('T')[0]
    const tomorrow = new Date(Date.now() + 86400000).toISOString()

    const [equipmentCount, courtsCount, reservationsCount, complaintsCount] = await Promise.all([
        db.select({ count: sql<number>`cast(count(*) as integer)` }).from(equipment),
        db.select({ count: sql<number>`cast(count(*) as integer)` }).from(courts).where(eq(courts.is_active, true)),
        db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(bookings)
            .where(and(gte(bookings.start_time, new Date(today)), lt(bookings.start_time, new Date(tomorrow)))),
        db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(feedbackComplaints)
            .where(eq(feedbackComplaints.status, 'open')),
    ])

    return {
        totalEquipment: equipmentCount[0]?.count || 0,
        activeCourts: courtsCount[0]?.count || 0,
        todayReservations: reservationsCount[0]?.count || 0,
        openComplaints: complaintsCount[0]?.count || 0,
    }
}
