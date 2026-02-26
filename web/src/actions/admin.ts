'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateCourtId } from '@/lib/sports'
import { generateEquipmentId } from '@/lib/sports'

/**
 * Admin Actions - Server actions for admin dashboard
 * All actions verify admin role for security
 */

//============================================
// Authorization Helper
//============================================

async function verifyAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        throw new Error('Unauthorized: No user logged in')
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || (profile.role !== 'admin' && profile.role !== 'superuser')) {
        throw new Error('Forbidden: Admin access required')
    }

    return { supabase, user }
}

//============================================
// Equipment Management
//============================================

export async function getEquipmentList(sport?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('equipment')
        .select('*')
        .order('created_at', { ascending: false })

    if (sport && sport !== 'all') {
        query = query.eq('sport', sport)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching equipment:', error)
        return []
    }

    return data || []
}

export async function createEquipment(formData: FormData) {
    const { supabase } = await verifyAdmin()

    // Get image files from formData
    const imageFiles = formData.getAll('images') as File[]

    const equipmentData = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        condition: formData.get('condition') as string || 'good',
        vendor_name: formData.get('vendor_name') as string || null,
        cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
        purchase_date: formData.get('purchase_date') as string || null,
        expected_lifespan_days: 365, // Default value, will be synced later
        is_available: true,
        total_usage_count: 0,
        pictures: [] as string[],
        notes: formData.get('notes') as string || ''
    }

    // Validate sport is provided
    if (!equipmentData.sport) {
        throw new Error('Sport is required')
    }

    // Generate equipment ID based on sport and current count
    const { count } = await supabase
        .from('equipment')
        .select('*', { count: 'exact', head: true })
        .eq('sport', equipmentData.sport)

    const equipmentId = generateEquipmentId(equipmentData.sport, count || 0)

    // First, create the equipment to get an ID
    const { data: equipment, error: insertError } = await supabase
        .from('equipment')
        .insert({
            ...equipmentData,
            equipment_id: equipmentId
        })
        .select()
        .single()

    if (insertError) {
        console.error('Error creating equipment:', insertError)
        throw new Error('Failed to create equipment')
    }

    // Upload images if any
    if (imageFiles.length > 0) {
        const uploadedUrls: string[] = []

        for (const file of imageFiles) {
            if (file.size === 0) continue // Skip empty files

            // Generate unique filename
            const timestamp = Date.now()
            const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const filePath = `${equipmentData.sport}/${equipment.id}/${filename}`

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('equipment-images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) {
                console.error('Error uploading image:', uploadError)
                continue // Skip this file but continue with others
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('equipment-images')
                .getPublicUrl(filePath)

            uploadedUrls.push(publicUrl)
        }

        // Update equipment with image URLs
        if (uploadedUrls.length > 0) {
            const { error: updateError } = await supabase
                .from('equipment')
                .update({ pictures: uploadedUrls })
                .eq('id', equipment.id)

            if (updateError) {
                console.error('Error updating equipment with images:', updateError)
            }
        }
    }

    revalidatePath('/admin/equipment')
    return equipment
}

export async function updateEquipment(id: string, formData: FormData) {
    const { supabase } = await verifyAdmin()

    // Get existing equipment to check current images
    const { data: existingEquipment } = await supabase
        .from('equipment')
        .select('pictures, sport')
        .eq('id', id)
        .single()

    // Get existing images that should be kept
    const existingImagesJson = formData.get('existingImages') as string || '[]'
    const existingImages = JSON.parse(existingImagesJson) as string[]

    // Get new image files
    const newImageFiles = formData.getAll('images') as File[]
    const uploadedUrls: string[] = [...existingImages]

    // Upload new images
    if (newImageFiles.length > 0) {
        for (const file of newImageFiles) {
            if (file.size === 0) continue

            const timestamp = Date.now()
            const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const filePath = `${existingEquipment?.sport || 'unknown'}/${id}/${filename}`

            const { error: uploadError } = await supabase.storage
                .from('equipment-images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) {
                console.error('Error uploading image:', uploadError)
                continue
            }

            const { data: { publicUrl } } = supabase.storage
                .from('equipment-images')
                .getPublicUrl(filePath)

            uploadedUrls.push(publicUrl)
        }
    }

    // Delete removed images from storage
    const removedImages = (existingEquipment?.pictures || []).filter(
        (url: string) => !existingImages.includes(url)
    )

    for (const url of removedImages) {
        try {
            const urlParts = url.split('/storage/v1/object/public/equipment-images/')
            if (urlParts.length >= 2) {
                const filePath = urlParts[1]
                await supabase.storage
                    .from('equipment-images')
                    .remove([filePath])
            }
        } catch (err) {
            console.error('Error deleting image:', err)
        }
    }

    const updates = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        condition: formData.get('condition') as string,
        vendor_name: formData.get('vendor_name') as string || null,
        cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
        purchase_date: formData.get('purchase_date') as string || null,
        pictures: uploadedUrls,
        notes: formData.get('notes') as string || ''
        // Note: usage_count and expected_lifespan_days are NOT updated here (read-only)
    }

    const { data, error } = await supabase
        .from('equipment')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating equipment:', error)
        throw new Error('Failed to update equipment')
    }

    revalidatePath('/admin/equipment')
    return data
}

export async function deleteEquipment(id: string) {
    const { supabase } = await verifyAdmin()

    // Get equipment images before deleting
    const { data: equipment } = await supabase
        .from('equipment')
        .select('pictures')
        .eq('id', id)
        .single()

    // Delete equipment record
    const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting equipment:', error)
        throw new Error('Failed to delete equipment')
    }

    // Delete associated images from storage
    if (equipment?.pictures && equipment.pictures.length > 0) {
        for (const url of equipment.pictures) {
            try {
                const urlParts = url.split('/storage/v1/object/public/equipment-images/')
                if (urlParts.length >= 2) {
                    const filePath = urlParts[1]
                    await supabase.storage
                        .from('equipment-images')
                        .remove([filePath])
                }
            } catch (err) {
                console.error('Error deleting image:', err)
            }
        }
    }

    revalidatePath('/admin/equipment')
    return { success: true }
}

//============================================
// Court Management
//============================================

export async function getCourtsList(sport?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('courts')
        .select('*')
        .order('created_at', { ascending: false })

    if (sport && sport !== 'all') {
        query = query.eq('sport', sport)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching courts:', error)
        return []
    }

    return data || []
}

export async function createCourt(formData: FormData) {
    const { supabase } = await verifyAdmin()

    // Get image files from formData
    const imageFiles = formData.getAll('images') as File[]

    const courtData = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        condition: formData.get('condition') as string || 'good',
        last_maintenance_date: formData.get('last_maintenance_date') as string || null,
        next_check_date: formData.get('next_check_date') as string || null,
        is_active: true,
        usage_count: 0,
        pictures: [] as string[],
        notes: formData.get('notes') as string || ''
    }

    // Validate sport is provided
    if (!courtData.sport) {
        throw new Error('Sport is required')
    }

    // Generate court ID based on sport and current count
    const { count } = await supabase
        .from('courts')
        .select('*', { count: 'exact', head: true })
        .eq('sport', courtData.sport)

    const courtId = generateCourtId(courtData.sport, count || 0)

    // First, create the court to get an ID
    const { data: court, error: insertError } = await supabase
        .from('courts')
        .insert({
            ...courtData,
            court_id: courtId
        })
        .select()
        .single()

    if (insertError) {
        console.error('Error creating court:', insertError)
        throw new Error(`Failed to create court: ${insertError.message || JSON.stringify(insertError)}`)
    }

    // Upload images if any
    if (imageFiles.length > 0) {
        const uploadedUrls: string[] = []

        for (const file of imageFiles) {
            if (file.size === 0) continue // Skip empty files

            // Generate unique filename
            const timestamp = Date.now()
            const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const filePath = `${courtData.sport}/${court.id}/${filename}`

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from('court-images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) {
                console.error('Error uploading image:', uploadError)
                continue // Skip this file but continue with others
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from('court-images')
                .getPublicUrl(filePath)

            uploadedUrls.push(publicUrl)
        }

        // Update court with image URLs
        if (uploadedUrls.length > 0) {
            const { error: updateError } = await supabase
                .from('courts')
                .update({ pictures: uploadedUrls })
                .eq('id', court.id)

            if (updateError) {
                console.error('Error updating court with images:', updateError)
            }
        }
    }

    revalidatePath('/admin/courts')
    return court
}

export async function updateCourt(id: string, formData: FormData) {
    const { supabase } = await verifyAdmin()

    // Get existing court data
    const { data: existingCourt } = await supabase
        .from('courts')
        .select('pictures, sport')
        .eq('id', id)
        .single()

    // Get existing images that user wants to keep
    const existingImagesJson = formData.get('existingImages') as string || '[]'
    const existingImages = JSON.parse(existingImagesJson) as string[]

    const newImageFiles = formData.getAll('images') as File[]
    const uploadedUrls: string[] = [...existingImages]

    // Upload new images if any
    if (newImageFiles.length > 0) {
        for (const file of newImageFiles) {
            if (file.size === 0) continue

            const timestamp = Date.now()
            const filename = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const filePath = `${existingCourt?.sport || 'unknown'}/${id}/${filename}`

            const { error: uploadError } = await supabase.storage
                .from('court-images')
                .upload(filePath, file, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) {
                console.error('Error uploading image:', uploadError)
                continue
            }

            const { data: { publicUrl } } = supabase.storage
                .from('court-images')
                .getPublicUrl(filePath)

            uploadedUrls.push(publicUrl)
        }
    }

    // Delete removed images from storage
    const removedImages = (existingCourt?.pictures || []).filter(
        (url: string) => !existingImages.includes(url)
    )

    for (const url of removedImages) {
        try {
            const urlParts = url.split('/storage/v1/object/public/court-images/')
            if (urlParts.length >= 2) {
                const filePath = urlParts[1]
                await supabase.storage
                    .from('court-images')
                    .remove([filePath])
            }
        } catch (err) {
            console.error('Error deleting image:', err)
        }
    }

    const updates = {
        name: formData.get('name') as string,
        condition: formData.get('condition') as string,
        last_maintenance_date: formData.get('last_maintenance_date') as string || null,
        next_check_date: formData.get('next_check_date') as string || null,
        pictures: uploadedUrls,
        notes: formData.get('notes') as string || ''
    }

    const { data, error } = await supabase
        .from('courts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating court:', error)
        throw new Error('Failed to update court')
    }

    revalidatePath('/admin/courts')
    return data
}

export async function deleteCourt(id: string) {
    const { supabase } = await verifyAdmin()

    // Get court data to delete images
    const { data: court } = await supabase
        .from('courts')
        .select('pictures')
        .eq('id', id)
        .single()

    // Delete associated images from storage
    if (court?.pictures && court.pictures.length > 0) {
        for (const url of court.pictures) {
            try {
                const urlParts = url.split('/storage/v1/object/public/court-images/')
                if (urlParts.length >= 2) {
                    const filePath = urlParts[1]
                    await supabase.storage
                        .from('court-images')
                        .remove([filePath])
                }
            } catch (err) {
                console.error('Error deleting image:', err)
            }
        }
    }

    // Hard delete the court record
    const { data, error } = await supabase
        .from('courts')
        .delete()
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error deleting court:', error)
        throw new Error('Failed to delete court')
    }

    revalidatePath('/admin/courts')
    return data
}

//============================================
// Announcements Management
//============================================

export async function getAnnouncements() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('announcements')
        .select('*, profiles(full_name)')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching announcements:', error)
        return []
    }

    return data || []
}

export async function createAnnouncement(title: string, content: string) {
    const { supabase, user } = await verifyAdmin()

    const { data, error } = await supabase
        .from('announcements')
        .insert({
            title,
            content,
            created_by: user.id
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating announcement:', error)
        throw new Error('Failed to create announcement')
    }

    revalidatePath('/admin/announcements')
    revalidatePath('/student')
    return data
}

export async function updateAnnouncement(id: string, title: string, content: string) {
    const { supabase } = await verifyAdmin()

    const { data, error } = await supabase
        .from('announcements')
        .update({ title, content })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating announcement:', error)
        throw new Error('Failed to update announcement')
    }

    revalidatePath('/admin/announcements')
    revalidatePath('/student')
    return data
}

export async function deleteAnnouncement(id: string) {
    const { supabase } = await verifyAdmin()

    const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting announcement:', error)
        throw new Error('Failed to delete announcement')
    }

    revalidatePath('/admin/announcements')
    revalidatePath('/student')
    return { success: true }
}

//============================================
// Reservations
//============================================

export async function getReservations(days: number = 3) {
    const supabase = await createClient()
    const now = new Date()
    const futureDate = new Date()
    futureDate.setDate(now.getDate() + days)

    const { data, error } = await supabase
        .from('bookings')
        .select('*, courts(*), profiles(full_name, student_id)')
        .gte('start_time', now.toISOString())
        .lte('start_time', futureDate.toISOString())
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching reservations:', error)
        return []
    }

    return data || []
}

/**
 * Get reservations for a specific sport and date (for calendar view)
 */
export async function getReservationsByDate(sport: string, date: string) {
    const supabase = await createClient()

    // Parse the date and get start/end of day
    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    const { data, error } = await supabase
        .from('bookings')
        .select('*, courts(*), profiles(full_name, student_id)')
        .eq('courts.sport', sport)
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching reservations by date:', error)
        return []
    }


    return data || []
}


/**
 * Cancel a reservation (deletes booking from database)
 * NOTE: For future notification logic - only notify student/manager
 * if the booking was student-made (not admin-made priority/maintenance)
 */
export async function cancelReservation(bookingId: string) {
    const { supabase } = await verifyAdmin()

    // Delete the booking
    const { error } = await supabase
        .from('bookings')
        .delete()
        .eq('id', bookingId)

    if (error) {
        console.error('Error cancelling reservation:', error)
        throw new Error(`Failed to cancel reservation: ${error.message}`)
    }

    revalidatePath('/admin/reservations')
    return { success: true }
}

/**
 * Create a priority reservation (admin booking)
 */
export async function priorityReserveSlot(
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
    numPlayers: number = 2,
    equipmentIds: string[] = []
) {
    const { supabase, user } = await verifyAdmin()

    // Create datetime strings
    const startDateTime = new Date(`${date}T${startTime}:00`)
    const endDateTime = new Date(`${date}T${endTime}:00`)

    // Check if slot is already booked (exclude cancelled/rejected)
    const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('court_id', courtId)
        .gte('start_time', startDateTime.toISOString())
        .lt('start_time', endDateTime.toISOString())
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .single()

    if (existingBooking) {
        throw new Error('This slot is already reserved')
    }

    // Create priority reservation
    const { data, error } = await supabase
        .from('bookings')
        .insert({
            court_id: courtId,
            user_id: user.id,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            status: 'confirmed',
            is_priority: true,
            num_players: numPlayers,
            equipment_ids: equipmentIds
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating priority reservation:', error)
        throw new Error(`Failed to create priority reservation: ${error.message}`)
    }

    revalidatePath('/admin/reservations')
    return data
}

/**
 * Reserve slot for maintenance (admin)
 */
export async function reserveForMaintenance(
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
    numPlayers: number = 2,
    equipmentIds: string[] = []
) {
    const { supabase, user } = await verifyAdmin()

    // Create datetime strings
    const startDateTime = new Date(`${date}T${startTime}:00`)
    const endDateTime = new Date(`${date}T${endTime}:00`)

    // Check if slot is already booked (exclude cancelled/rejected)
    const { data: existingBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('court_id', courtId)
        .gte('start_time', startDateTime.toISOString())
        .lt('start_time', endDateTime.toISOString())
        .neq('status', 'cancelled')
        .neq('status', 'rejected')
        .single()

    if (existingBooking) {
        throw new Error('This slot is already reserved')
    }

    // Create maintenance reservation
    const { data, error } = await supabase
        .from('bookings')
        .insert({
            court_id: courtId,
            user_id: user.id,
            start_time: startDateTime.toISOString(),
            end_time: endDateTime.toISOString(),
            status: 'confirmed',
            is_maintenance: true,
            num_players: numPlayers,
            equipment_ids: equipmentIds
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating maintenance reservation:', error)
        throw new Error(`Failed to create maintenance reservation: ${error.message}`)
    }

    revalidatePath('/admin/reservations')
    return data
}

/**
 * Get equipment list filtered by sport (for booking dialog)
 */
export async function getEquipmentBySport(sport: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('equipment')
        .select('id, name, equipment_id, sport, condition')
        .eq('sport', sport)
        .order('name')

    if (error) {
        console.error('Error fetching equipment:', error)
        return []
    }

    return data || []
}


export async function forceCancelBooking(bookingId: string) {
    const { supabase } = await verifyAdmin()

    const { data, error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', bookingId)
        .select()
        .single()

    if (error) {
        console.error('Error cancelling booking:', error)
        throw new Error('Failed to cancel booking')
    }

    revalidatePath('/admin/reservations')
    return data
}

//============================================
// Booking Logs
//============================================

/**
 * Get all bookings (any status) for a given sport + date — used by the admin logs page.
 */
export async function getBookingLogs(sport: string, date: string) {
    const supabase = await createClient()

    const startOfDay = new Date(date)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(date)
    endOfDay.setHours(23, 59, 59, 999)

    // Step 1: get all court IDs for this sport
    const { data: courts, error: courtsError } = await supabase
        .from('courts')
        .select('id, name, sport')
        .eq('sport', sport)

    if (courtsError || !courts || courts.length === 0) {
        if (courtsError) console.error('Error fetching courts for logs:', courtsError)
        return []
    }

    const courtIds = courts.map((c: any) => c.id)
    const courtMap: Record<string, { name: string; sport: string }> = Object.fromEntries(
        courts.map((c: any) => [c.id, { name: c.name, sport: c.sport }])
    )

    // Step 2: fetch bookings for those courts on the given date (ALL statuses)
    const { data: bookings, error } = await supabase
        .from('bookings')
        .select(`
            id, status, start_time, end_time, num_players,
            equipment_ids, players_list, is_priority, is_maintenance, created_at, court_id,
            profiles!bookings_user_id_fkey(full_name, student_id, email)
        `)
        .in('court_id', courtIds)
        .gte('start_time', startOfDay.toISOString())
        .lte('start_time', endOfDay.toISOString())
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching booking logs:', error)
        return []
    }

    if (!bookings || bookings.length === 0) return []

    // Step 3: fetch equipment details for all equipment used in these bookings
    const allEquipmentIds = [...new Set(bookings.flatMap((b: any) => b.equipment_ids || []))]

    let equipmentMap: Record<string, { id: string; name: string; condition: string }> = {}
    if (allEquipmentIds.length > 0) {
        const { data: equipmentData } = await supabase
            .from('equipment')
            .select('id, name, condition')
            .in('id', allEquipmentIds)

        if (equipmentData) {
            equipmentMap = Object.fromEntries(equipmentData.map((e: any) => [e.id, e]))
        }
    }

    // Step 4: fetch player profiles for all players_list IDs across all bookings
    const allPlayerIds = [
        ...new Set(bookings.flatMap((b: any) => b.players_list || []))
    ].filter(Boolean) as string[]

    let playerMap: Record<string, { id: string; full_name: string; student_id: string; email: string }> = {}
    if (allPlayerIds.length > 0) {
        const { data: playerProfiles } = await supabase
            .from('profiles')
            .select('id, full_name, student_id, email')
            .in('id', allPlayerIds)

        if (playerProfiles) {
            playerMap = Object.fromEntries(playerProfiles.map((p: any) => [p.id, p]))
        }
    }

    // Attach court name, equipment details, and player profiles to each booking
    return bookings.map((b: any) => ({
        ...b,
        courts: courtMap[b.court_id] || null,
        equipment: (b.equipment_ids || []).map((eid: string) => equipmentMap[eid]).filter(Boolean),
        players: (b.players_list || []).map((pid: string) => playerMap[pid]).filter(Boolean),
    }))
}

//============================================
// Feedback & Complaints
//============================================

export async function getFeedback(statusFilter?: string, categoryFilter?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('feedback_complaints')
        .select('*, profiles!feedback_complaints_student_id_fkey(full_name, student_id)')
        .order('created_at', { ascending: false })

    if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
    }

    if (categoryFilter && categoryFilter !== 'all') {
        query = query.eq('category', categoryFilter)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching feedback:', error)
        return []
    }

    return data || []
}

/**
 * Mark feedback as read (delete from database)
 */
export async function markFeedbackAsRead(feedbackId: string) {
    const supabase = await createClient()

    const { error } = await supabase
        .from('feedback_complaints')
        .delete()
        .eq('id', feedbackId)

    if (error) {
        console.error('Error deleting feedback:', error)
        throw new Error(`Failed to mark feedback as read: ${error.message}`)
    }

    revalidatePath('/admin/feedback')
    return { success: true }
}

export async function updateComplaintStatus(id: string, status: string) {
    const { supabase, user } = await verifyAdmin()

    const updates: any = { status }

    if (status === 'resolved') {
        updates.resolved_by = user.id
        updates.resolved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
        .from('feedback_complaints')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating complaint status:', error)
        throw new Error('Failed to update complaint status')
    }

    revalidatePath('/admin/feedback')
    return data
}

//============================================
// Coordinators
//============================================

export async function getCoordinators(sport?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('coordinators')
        .select('*')
        .order('created_at', { ascending: false })

    if (sport && sport !== 'all') {
        query = query.eq('sport', sport)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching coordinators:', error)
        return []
    }

    return data || []
}

export async function createCoordinator(formData: FormData) {
    const { supabase } = await verifyAdmin()

    const coordinatorData = {
        name: formData.get('name') as string,
        role: formData.get('role') as string,
        sport: formData.get('sport') as string,
        email: formData.get('email') as string || null,
        phone: formData.get('phone') as string || null,
        notes: formData.get('notes') as string || null,
    }

    const { data, error } = await supabase
        .from('coordinators')
        .insert(coordinatorData)
        .select()
        .single()

    if (error) {
        console.error('Error creating coordinator:', error)
        throw new Error('Failed to create coordinator')
    }

    revalidatePath('/admin/coordinators')
    return data
}

export async function updateCoordinator(id: string, formData: FormData) {
    const { supabase } = await verifyAdmin()

    const updates = {
        name: formData.get('name') as string,
        role: formData.get('role') as string,
        sport: formData.get('sport') as string,
        email: formData.get('email') as string || null,
        phone: formData.get('phone') as string || null,
        notes: formData.get('notes') as string || null,
    }

    const { data, error } = await supabase
        .from('coordinators')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating coordinator:', error)
        throw new Error('Failed to update coordinator')
    }

    revalidatePath('/admin/coordinators')
    return data
}

export async function deleteCoordinator(id: string) {
    const { supabase } = await verifyAdmin()

    const { error } = await supabase
        .from('coordinators')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting coordinator:', error)
        throw new Error('Failed to delete coordinator')
    }

    revalidatePath('/admin/coordinators')
    return { success: true }
}

//============================================
// Violations
//============================================

export async function getViolations(filters?: { severity?: string; violationType?: string }) {
    const supabase = await createClient()

    let query = supabase
        .from('student_violations')
        .select('*, profiles!student_violations_student_id_fkey(full_name, student_id), reported_by_profile:profiles!student_violations_reported_by_fkey(full_name)')
        .order('created_at', { ascending: false })

    if (filters?.severity && filters.severity !== 'all') {
        query = query.eq('severity', filters.severity)
    }

    if (filters?.violationType && filters.violationType !== 'all') {
        query = query.eq('violation_type', filters.violationType)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching violations:', error)
        return []
    }

    return data || []
}

/**
 * Get defaulter students (grouped violations by student)
 */
export async function getDefaulterStudents() {
    const supabase = await createClient()

    // Fetch all violations with student details
    const { data: violations, error } = await supabase
        .from('student_violations')
        .select('*, profiles!student_violations_student_id_fkey(full_name, student_id, email), reported_by_profile:profiles!student_violations_reported_by_fkey(full_name)')
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching violations:', error)
        return []
    }

    if (!violations || violations.length === 0) {
        return []
    }

    // Group violations by student
    const studentMap = new Map<string, {
        student_id: string
        student_name: string
        student_roll: string
        student_email: string
        total_violations: number
        latest_reason: string
        latest_violation_type: string
        latest_source: 'system' | 'manager'
        latest_date: string
        violations: any[]
    }>()

    violations.forEach(violation => {
        const studentId = violation.student_id
        const profile = violation.profiles

        if (!studentMap.has(studentId)) {
            studentMap.set(studentId, {
                student_id: studentId,
                student_name: profile?.full_name || 'Unknown',
                student_roll: profile?.student_id || '-',
                student_email: profile?.email || '',
                total_violations: 0,
                latest_reason: violation.reason || 'No reason provided',
                latest_violation_type: violation.violation_type || 'other',
                latest_source: violation.reported_by ? 'manager' : 'system',
                latest_date: violation.created_at,
                violations: []
            })
        }

        const student = studentMap.get(studentId)!
        student.total_violations++
        student.violations.push(violation)
    })

    return Array.from(studentMap.values()).sort((a, b) =>
        new Date(b.latest_date).getTime() - new Date(a.latest_date).getTime()
    )
}

/**
 * Remove student from defaulters list (clear all violations)
 */
export async function removeStudentFromDefaulters(studentId: string) {
    const { supabase } = await verifyAdmin()

    // Delete all violations for this student
    const { error } = await supabase
        .from('student_violations')
        .delete()
        .eq('student_id', studentId)

    if (error) {
        console.error('Error removing student from defaulters:', error)
        throw new Error(`Failed to remove student from defaulters: ${error.message}`)
    }

    revalidatePath('/admin/defaulters')
    return { success: true }
}

export async function getStudentViolationHistory(studentId: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from('student_violations')
        .select('*, reported_by_profile:profiles!student_violations_reported_by_fkey(full_name)')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching student violation history:', error)
        return []
    }

    return data || []
}

//============================================
// Dashboard Stats
//============================================

export async function getDashboardStats() {
    const supabase = await createClient()

    const stats = {
        totalEquipment: 0,
        activeCourts: 0,
        todayReservations: 0,
        openComplaints: 0,
    }

    const [equipmentCount, courtsCount, reservationsCount, complaintsCount] = await Promise.all([
        supabase.from('equipment').select('*', { count: 'exact', head: true }),
        supabase.from('courts').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('bookings').select('*', { count: 'exact', head: true })
            .gte('start_time', new Date().toISOString().split('T')[0])
            .lt('start_time', new Date(Date.now() + 86400000).toISOString()),
        supabase.from('feedback_complaints').select('*', { count: 'exact', head: true }).eq('status', 'open')
    ])

    stats.totalEquipment = equipmentCount.count || 0
    stats.activeCourts = courtsCount.count || 0
    stats.todayReservations = reservationsCount.count || 0
    stats.openComplaints = complaintsCount.count || 0

    return stats
}
