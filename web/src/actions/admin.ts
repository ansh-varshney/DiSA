'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

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

    if (!profile || profile.role !== 'admin') {
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

    const equipmentData = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        condition: formData.get('condition') as string || 'good',
        vendor_name: formData.get('vendor_name') as string || null,
        cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
        purchase_date: formData.get('purchase_date') as string || null,
        expected_lifespan_days: formData.get('expected_lifespan_days')
            ? parseInt(formData.get('expected_lifespan_days') as string)
            : 365,
        is_available: true,
        total_usage_count: 0
    }

    const { data, error } = await supabase
        .from('equipment')
        .insert(equipmentData)
        .select()
        .single()

    if (error) {
        console.error('Error creating equipment:', error)
        throw new Error('Failed to create equipment')
    }

    revalidatePath('/admin/equipment')
    return data
}

export async function updateEquipment(id: string, formData: FormData) {
    const { supabase } = await verifyAdmin()

    const updates = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        condition: formData.get('condition') as string,
        vendor_name: formData.get('vendor_name') as string || null,
        cost: formData.get('cost') ? parseFloat(formData.get('cost') as string) : null,
        purchase_date: formData.get('purchase_date') as string || null,
        expected_lifespan_days: formData.get('expected_lifespan_days')
            ? parseInt(formData.get('expected_lifespan_days') as string)
            : 365,
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

    const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting equipment:', error)
        throw new Error('Failed to delete equipment')
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

    const courtData = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        type: formData.get('type') as string || null,
        capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : 4,
        condition: formData.get('condition') as string || 'good',
        maintenance_notes: formData.get('maintenance_notes') as string || null,
        last_maintenance_date: formData.get('last_maintenance_date') as string || null,
        is_active: true,
        usage_count: 0
    }

    const { data, error } = await supabase
        .from('courts')
        .insert(courtData)
        .select()
        .single()

    if (error) {
        console.error('Error creating court:', error)
        throw new Error('Failed to create court')
    }

    revalidatePath('/admin/courts')
    return data
}

export async function updateCourt(id: string, formData: FormData) {
    const { supabase } = await verifyAdmin()

    const updates = {
        name: formData.get('name') as string,
        sport: formData.get('sport') as string,
        type: formData.get('type') as string || null,
        capacity: formData.get('capacity') ? parseInt(formData.get('capacity') as string) : 4,
        condition: formData.get('condition') as string,
        maintenance_notes: formData.get('maintenance_notes') as string || null,
        last_maintenance_date: formData.get('last_maintenance_date') as string || null,
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

    // Soft delete - set is_active to false
    const { data, error } = await supabase
        .from('courts')
        .update({ is_active: false })
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
        .order('start_time', { ascending: true })

    if (error) {
        console.error('Error fetching reservations:', error)
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
// Feedback & Complaints
//============================================

export async function getFeedback(statusFilter?: string) {
    const supabase = await createClient()

    let query = supabase
        .from('feedback_complaints')
        .select('*, profiles(full_name, student_id)')
        .order('created_at', { ascending: false })

    if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) {
        console.error('Error fetching feedback:', error)
        return []
    }

    return data || []
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
