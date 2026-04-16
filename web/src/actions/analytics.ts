'use server'

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { sendNotifications } from '@/actions/notifications'

//============================================
// Financials Dashboard
//============================================

export async function getFinancialsData(vendor?: string) {
    const supabase = await createClient()

    // Get all unique vendors first (unfiltered)
    const { data: allEquipment } = await supabase.from('equipment').select('vendor_name')

    const vendors: string[] = [
        ...new Set(
            (allEquipment || [])
                .map((e: { vendor_name: string | null }) => e.vendor_name)
                .filter((v): v is string => Boolean(v))
        ),
    ]

    // Fetch equipment, optionally filtered by vendor
    let query = supabase
        .from('equipment')
        .select(
            'name, sport, cost, expected_lifespan_days, total_usage_count, condition, vendor_name'
        )

    if (vendor && vendor !== 'all') {
        query = query.eq('vendor_name', vendor)
    }

    const { data: equipment, error } = await query

    if (error || !equipment) {
        return {
            vendors,
            total: 0,
            avgLifespanSessions: null,
            totalCost: 0,
            costBySport: {},
            countBySport: {},
            lifespanBySport: {},
        }
    }

    const total = equipment.length

    // Lifespan only for expired items (damaged/lost), using total_usage_count as actual sessions survived
    const expiredItems = equipment.filter(
        (e) => e.condition === 'damaged' || e.condition === 'lost'
    )
    const avgLifespanSessions: number | null =
        expiredItems.length > 0
            ? Math.round(
                  expiredItems.reduce((sum, e) => sum + (e.total_usage_count || 0), 0) /
                      expiredItems.length
              )
            : null

    const costBySport: Record<string, number> = {}
    const countBySport: Record<string, number> = {}
    const lifespanSumBySport: Record<string, number> = {}
    const lifespanCountBySport: Record<string, number> = {}

    for (const e of equipment) {
        const sport = e.sport || 'Unknown'
        costBySport[sport] = (costBySport[sport] || 0) + (e.cost || 0)
        countBySport[sport] = (countBySport[sport] || 0) + 1
    }

    for (const e of expiredItems) {
        const sport = e.sport || 'Unknown'
        if (e.total_usage_count) {
            lifespanSumBySport[sport] = (lifespanSumBySport[sport] || 0) + e.total_usage_count
            lifespanCountBySport[sport] = (lifespanCountBySport[sport] || 0) + 1
        }
    }

    const lifespanBySport: Record<string, number> = {}
    for (const sport of Object.keys(lifespanSumBySport)) {
        lifespanBySport[sport] = Math.round(lifespanSumBySport[sport] / lifespanCountBySport[sport])
    }

    const totalCost = Object.values(costBySport).reduce((a, b) => a + b, 0)

    return {
        vendors,
        total,
        avgLifespanSessions,
        totalCost,
        costBySport,
        countBySport,
        lifespanBySport,
    }
}

//============================================
// Team Performance Dashboard
//============================================

export async function getTeamPerformanceData(sport?: string, startDate?: string, endDate?: string) {
    // Use admin client to bypass RLS on bookings
    const adminSupabase = createAdminClient()

    if (!sport || sport === 'all') {
        return {
            practiceSessions: 0,
            tournaments: 0,
            wins: 0,
            losses: 0,
            trophies: 0,
            monthlyPractice: [] as { month: string; count: number }[],
        }
    }

    const { data: courts } = await adminSupabase.from('courts').select('id').eq('sport', sport)

    if (!courts || courts.length === 0) {
        return {
            practiceSessions: 0,
            tournaments: 0,
            wins: 0,
            losses: 0,
            trophies: 0,
            monthlyPractice: [] as { month: string; count: number }[],
        }
    }

    const courtIds = courts.map((c: { id: string }) => c.id)

    let query = adminSupabase
        .from('bookings')
        .select('id, start_time')
        .in('court_id', courtIds)
        .eq('status', 'completed')
        .eq('is_maintenance', false)

    if (startDate) query = query.gte('start_time', startDate)
    if (endDate) query = query.lte('start_time', endDate + 'T23:59:59')

    const { data: bookings } = await query

    const monthlyMap: Record<string, number> = {}
    for (const b of bookings || []) {
        const d = new Date(b.start_time)
        const key = d.toLocaleString('default', { month: 'short', year: '2-digit' })
        monthlyMap[key] = (monthlyMap[key] || 0) + 1
    }

    const monthlyPractice = Object.entries(monthlyMap)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => {
            const parseMonth = (str: string) => {
                const [mon, yr] = str.split(' ')
                const months = [
                    'Jan',
                    'Feb',
                    'Mar',
                    'Apr',
                    'May',
                    'Jun',
                    'Jul',
                    'Aug',
                    'Sep',
                    'Oct',
                    'Nov',
                    'Dec',
                ]
                return parseInt('20' + yr) * 12 + months.indexOf(mon)
            }
            return parseMonth(a.month) - parseMonth(b.month)
        })

    return {
        practiceSessions: bookings?.length ?? 0,
        tournaments: 0,
        wins: 0,
        losses: 0,
        trophies: 0,
        monthlyPractice,
    }
}

//============================================
// Student Welfare Dashboard
//============================================

// Top stats for the current month (uses admin client to see all bookings)
export async function getWelfareTopStats() {
    const adminSupabase = createAdminClient()
    const supabase = await createClient()

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

    const [{ count: successfulBookings }, { count: totalStudents }, { data: activeBookings }] =
        await Promise.all([
            adminSupabase
                .from('bookings')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'completed')
                .gte('start_time', start)
                .lte('start_time', end),
            supabase
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('role', 'student'),
            adminSupabase
                .from('bookings')
                .select('user_id')
                .eq('status', 'completed')
                .gte('start_time', start)
                .lte('start_time', end),
        ])

    const uniqueActiveStudents = new Set(
        (activeBookings || []).map((b: { user_id: string }) => b.user_id)
    ).size
    const participationPct =
        totalStudents && uniqueActiveStudents
            ? Math.round((uniqueActiveStudents / totalStudents) * 100)
            : 0

    return { successfulBookings: successfulBookings ?? 0, participationPct }
}

// Participation stats — grouped by branch, year, or sport
// Accepts explicit date range strings (YYYY-MM-DD)
export async function getParticipationStats(
    parameter: string, // 'branch' | 'year' | 'sport'
    startDate?: string,
    endDate?: string
) {
    const adminSupabase = createAdminClient()

    // 1. Fetch completed bookings in range
    let bookingQuery = adminSupabase
        .from('bookings')
        .select('id, user_id, court_id')
        .eq('status', 'completed')
        .eq('is_maintenance', false)

    if (startDate) bookingQuery = bookingQuery.gte('start_time', startDate)
    if (endDate) bookingQuery = bookingQuery.lte('start_time', endDate + 'T23:59:59')

    const { data: bookings } = await bookingQuery
    if (!bookings || bookings.length === 0)
        return { barData: [], genderData: { Male: 0, Female: 0 } }

    // 2. Fetch profiles for those users
    const userIds = [...new Set(bookings.map((b: { user_id: string }) => b.user_id))]
    const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id, branch, gender, year')
        .in('id', userIds)

    // 3. Fetch courts if grouping by sport
    let courtMap: Record<string, string> = {}
    if (parameter === 'sport') {
        const courtIds = [...new Set(bookings.map((b: { court_id: string }) => b.court_id))]
        const { data: courts } = await adminSupabase
            .from('courts')
            .select('id, sport')
            .in('id', courtIds)
        courtMap = Object.fromEntries(
            (courts || []).map((c: { id: string; sport: string }) => [c.id, c.sport])
        )
    }

    const profileMap = Object.fromEntries(
        (profiles || []).map(
            (p: {
                id: string
                branch: string | null
                gender: string | null
                year: string | null
            }) => [p.id, p]
        )
    )

    const countByParam: Record<string, number> = {}
    const genderCount: Record<string, number> = { Male: 0, Female: 0 }

    for (const b of bookings) {
        const profile = profileMap[(b as { user_id: string }).user_id]
        let key = 'Unknown'
        if (parameter === 'branch') key = profile?.branch || 'Unknown'
        else if (parameter === 'year') key = profile?.year || 'Unknown'
        else if (parameter === 'sport')
            key = courtMap[(b as { court_id: string }).court_id] || 'Unknown'

        countByParam[key] = (countByParam[key] || 0) + 1

        const gender: string = profile?.gender || 'Other'
        if (gender === 'Male') genderCount.Male++
        else if (gender === 'Female') genderCount.Female++
    }

    const barData = Object.entries(countByParam)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)

    return { barData, genderData: { Male: genderCount.Male, Female: genderCount.Female } }
}

// Branch profile drill-down: dual bars (Male/Female) per sport or year
export async function getBranchProfileData(
    branch: string, // branch name or 'Overall'
    xAxis: string, // 'sport' | 'year'
    startDate?: string,
    endDate?: string
) {
    const adminSupabase = createAdminClient()

    let bookingQuery = adminSupabase
        .from('bookings')
        .select('id, user_id, court_id')
        .eq('status', 'completed')
        .eq('is_maintenance', false)

    if (startDate) bookingQuery = bookingQuery.gte('start_time', startDate)
    if (endDate) bookingQuery = bookingQuery.lte('start_time', endDate + 'T23:59:59')

    const { data: bookings } = await bookingQuery
    if (!bookings || bookings.length === 0) return []

    const userIds = [...new Set(bookings.map((b: { user_id: string }) => b.user_id))]
    const { data: profiles } = await adminSupabase
        .from('profiles')
        .select('id, branch, gender, year')
        .in('id', userIds)

    const profileMap = Object.fromEntries(
        (profiles || []).map(
            (p: {
                id: string
                branch: string | null
                gender: string | null
                year: string | null
            }) => [p.id, p]
        )
    )

    let courtMap: Record<string, string> = {}
    if (xAxis === 'sport') {
        const courtIds = [...new Set(bookings.map((b: { court_id: string }) => b.court_id))]
        const { data: courts } = await adminSupabase
            .from('courts')
            .select('id, sport')
            .in('id', courtIds)
        courtMap = Object.fromEntries(
            (courts || []).map((c: { id: string; sport: string }) => [c.id, c.sport])
        )
    }

    const map: Record<string, { Male: number; Female: number }> = {}

    for (const b of bookings) {
        const profile = profileMap[(b as { user_id: string }).user_id]
        if (branch !== 'Overall' && profile?.branch !== branch) continue

        const key =
            xAxis === 'sport'
                ? courtMap[(b as { court_id: string }).court_id] || 'Unknown'
                : profile?.year || 'Unknown'

        if (!map[key]) map[key] = { Male: 0, Female: 0 }
        const gender: string = profile?.gender || ''
        if (gender === 'Male') map[key].Male++
        else if (gender === 'Female') map[key].Female++
    }

    return Object.entries(map)
        .map(([label, counts]) => ({ label, ...counts }))
        .sort((a, b) => b.Male + b.Female - (a.Male + a.Female))
}

// Admin leaderboard: all students ordered by monthly points, optionally filtered by date range
export async function getAdminLeaderboard(startDate?: string, endDate?: string) {
    const adminSupabase = createAdminClient()
    const supabase = await createClient()

    if (!startDate && !endDate) {
        // Auto-reset points if we're in a new calendar month (idempotent RPC).
        // When a fresh reset runs, notify the top-5 students who earned a priority booking slot.
        const { data: resetResult } = await adminSupabase.rpc('reset_monthly_points')
        if (
            resetResult?.reset_count > 0 &&
            Array.isArray(resetResult?.top5_ids) &&
            resetResult.top5_ids.length > 0
        ) {
            await sendNotifications(
                resetResult.top5_ids.map((id: string) => ({
                    recipientId: id,
                    type: 'priority_booking_awarded',
                    title: 'Monthly Leaderboard Reward!',
                    body: 'You finished in the top 5 this month! You have earned a priority booking — book a 90-minute session anytime this month.',
                    data: { reward: 'priority_booking' },
                }))
            )
        }

        const { data } = await adminSupabase
            .from('profiles')
            .select('id, full_name, branch, year, gender, points')
            .eq('role', 'student')
            .order('points', { ascending: false })

        return (data || []).map((s: any, i: number) => ({ ...s, rank: i + 1, sessions: undefined }))
    }

    let bookingQuery = adminSupabase
        .from('bookings')
        .select('user_id')
        .eq('status', 'completed')
        .eq('is_maintenance', false)

    if (startDate) bookingQuery = bookingQuery.gte('start_time', startDate)
    if (endDate) bookingQuery = bookingQuery.lte('start_time', endDate + 'T23:59:59')

    const { data: bookings } = await bookingQuery
    if (!bookings) return []

    // Count sessions per student
    const sessionCount: Record<string, number> = {}
    for (const b of bookings) {
        const uid = (b as { user_id: string }).user_id
        sessionCount[uid] = (sessionCount[uid] || 0) + 1
    }

    if (Object.keys(sessionCount).length === 0) return []

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, branch, year, gender, points')
        .in('id', Object.keys(sessionCount))

    return (profiles || [])
        .map((p) => ({ ...p, sessions: sessionCount[p.id] || 0 }))
        .sort((a, b) => b.sessions - a.sessions || b.points - a.points)
        .map((s, i) => ({ ...s, rank: i + 1 }))
}

// Get unique branches from student profiles (for dropdown)
export async function getBranches(): Promise<string[]> {
    const supabase = await createClient()
    const { data } = await supabase
        .from('profiles')
        .select('branch')
        .eq('role', 'student')
        .not('branch', 'is', null)

    return [...new Set((data || []).map((p: { branch: string }) => p.branch).filter(Boolean))]
}
