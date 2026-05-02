'use server'

import { db } from '@/db'
import { equipment, courts, bookings, profiles } from '@/db/schema'
import { eq, and, gte, lte, inArray, notInArray, desc, asc, sql, ne } from 'drizzle-orm'
import { sendNotifications } from '@/actions/notifications'
import { requireAdmin } from '@/lib/auth-guards'

//============================================
// Financials Dashboard
//============================================

export async function getFinancialsData(vendor?: string) {
    await requireAdmin()
    // Get all unique vendors first (unfiltered)
    const allEquipmentRows = await db.select({ vendor_name: equipment.vendor_name }).from(equipment)

    const vendors: string[] = [
        ...new Set<string>(
            (allEquipmentRows || [])
                .map((e: { vendor_name: string | null }) => e.vendor_name)
                .filter((v: string | null): v is string => Boolean(v))
        ),
    ]

    // Fetch equipment, optionally filtered by vendor
    const whereClause = vendor && vendor !== 'all' ? eq(equipment.vendor_name, vendor) : undefined

    const equipmentRows = await db
        .select({
            name: equipment.name,
            sport: equipment.sport,
            cost: equipment.cost,
            expected_lifespan_days: equipment.expected_lifespan_days,
            total_usage_count: equipment.total_usage_count,
            condition: equipment.condition,
            vendor_name: equipment.vendor_name,
        })
        .from(equipment)
        .where(whereClause)

    if (!equipmentRows || equipmentRows.length === 0) {
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

    const total = equipmentRows.length

    // Lifespan only for expired items (damaged/lost), using total_usage_count as actual sessions survived
    const expiredItems = equipmentRows.filter(
        (e: any) => e.condition === 'damaged' || e.condition === 'lost'
    )
    const avgLifespanSessions: number | null =
        expiredItems.length > 0
            ? Math.round(
                  expiredItems.reduce(
                      (sum: number, e: any) => sum + (e.total_usage_count || 0),
                      0
                  ) / expiredItems.length
              )
            : null

    const costBySport: Record<string, number> = {}
    const countBySport: Record<string, number> = {}
    const lifespanSumBySport: Record<string, number> = {}
    const lifespanCountBySport: Record<string, number> = {}

    for (const e of equipmentRows) {
        const sport = e.sport || 'Unknown'
        costBySport[sport] = (costBySport[sport] || 0) + (parseFloat(e.cost ?? '0') || 0)
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
    await requireAdmin()
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

    const courtRows = await db.select({ id: courts.id }).from(courts).where(eq(courts.sport, sport))

    if (!courtRows || courtRows.length === 0) {
        return {
            practiceSessions: 0,
            tournaments: 0,
            wins: 0,
            losses: 0,
            trophies: 0,
            monthlyPractice: [] as { month: string; count: number }[],
        }
    }

    const courtIds = courtRows.map((c) => c.id)

    const conditions = [
        inArray(bookings.court_id, courtIds),
        eq(bookings.status, 'completed'),
        eq(bookings.is_maintenance, false),
    ]
    if (startDate) conditions.push(gte(bookings.start_time, new Date(startDate)))
    if (endDate) conditions.push(lte(bookings.start_time, new Date(endDate + 'T23:59:59')))

    const bookingRows = await db
        .select({ id: bookings.id, start_time: bookings.start_time })
        .from(bookings)
        .where(and(...conditions))

    const monthlyMap: Record<string, number> = {}
    for (const b of bookingRows) {
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
        practiceSessions: bookingRows.length,
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

export async function getWelfareTopStats() {
    await requireAdmin()
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const [bookingCountRows, studentCountRows, activeBookingRows] = await Promise.all([
        db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(bookings)
            .where(
                and(
                    eq(bookings.status, 'completed'),
                    gte(bookings.start_time, start),
                    lte(bookings.start_time, end)
                )
            ),
        db
            .select({ count: sql<number>`cast(count(*) as integer)` })
            .from(profiles)
            .where(eq(profiles.role, 'student')),
        db
            .select({ user_id: bookings.user_id })
            .from(bookings)
            .where(
                and(
                    eq(bookings.status, 'completed'),
                    gte(bookings.start_time, start),
                    lte(bookings.start_time, end)
                )
            ),
    ])

    const successfulBookings = bookingCountRows[0]?.count ?? 0
    const totalStudents = studentCountRows[0]?.count ?? 0
    const uniqueActiveStudents = new Set(activeBookingRows.map((b) => b.user_id)).size
    const participationPct =
        totalStudents && uniqueActiveStudents
            ? Math.round((uniqueActiveStudents / totalStudents) * 100)
            : 0

    return { successfulBookings, participationPct }
}

export async function getParticipationStats(
    parameter: string,
    startDate?: string,
    endDate?: string
) {
    await requireAdmin()
    const bookingConditions = [eq(bookings.status, 'completed'), eq(bookings.is_maintenance, false)]
    if (startDate) bookingConditions.push(gte(bookings.start_time, new Date(startDate)))
    if (endDate) bookingConditions.push(lte(bookings.start_time, new Date(endDate + 'T23:59:59')))

    const bookingRows = await db
        .select({ id: bookings.id, user_id: bookings.user_id, court_id: bookings.court_id })
        .from(bookings)
        .where(and(...bookingConditions))

    if (!bookingRows || bookingRows.length === 0)
        return { barData: [], genderData: { Male: 0, Female: 0 } }

    const userIds = [...new Set(bookingRows.map((b) => b.user_id))]
    const profileRows = await db
        .select({
            id: profiles.id,
            branch: profiles.branch,
            gender: profiles.gender,
            year: profiles.year,
        })
        .from(profiles)
        .where(inArray(profiles.id, userIds))

    let courtMap: Record<string, string> = {}
    if (parameter === 'sport') {
        const courtIds = [...new Set(bookingRows.map((b) => b.court_id))]
        const courtRows = await db
            .select({ id: courts.id, sport: courts.sport })
            .from(courts)
            .where(inArray(courts.id, courtIds))
        courtMap = Object.fromEntries(courtRows.map((c) => [c.id, c.sport]))
    }

    const profileMap = Object.fromEntries(profileRows.map((p) => [p.id, p]))

    const countByParam: Record<string, number> = {}
    const genderCount: Record<string, number> = { Male: 0, Female: 0 }

    for (const b of bookingRows) {
        const profile = profileMap[b.user_id]
        let key = 'Unknown'
        if (parameter === 'branch') key = profile?.branch || 'Unknown'
        else if (parameter === 'year') key = profile?.year || 'Unknown'
        else if (parameter === 'sport') key = courtMap[b.court_id] || 'Unknown'

        countByParam[key] = (countByParam[key] || 0) + 1

        const gender = profile?.gender || 'Other'
        if (gender === 'Male') genderCount.Male++
        else if (gender === 'Female') genderCount.Female++
    }

    const barData = Object.entries(countByParam)
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count)

    return { barData, genderData: { Male: genderCount.Male, Female: genderCount.Female } }
}

export async function getBranchProfileData(
    branch: string,
    xAxis: string,
    startDate?: string,
    endDate?: string
) {
    await requireAdmin()
    const bookingConditions = [eq(bookings.status, 'completed'), eq(bookings.is_maintenance, false)]
    if (startDate) bookingConditions.push(gte(bookings.start_time, new Date(startDate)))
    if (endDate) bookingConditions.push(lte(bookings.start_time, new Date(endDate + 'T23:59:59')))

    const bookingRows = await db
        .select({ id: bookings.id, user_id: bookings.user_id, court_id: bookings.court_id })
        .from(bookings)
        .where(and(...bookingConditions))

    if (!bookingRows || bookingRows.length === 0) return []

    const userIds = [...new Set(bookingRows.map((b) => b.user_id))]
    const profileRows = await db
        .select({
            id: profiles.id,
            branch: profiles.branch,
            gender: profiles.gender,
            year: profiles.year,
        })
        .from(profiles)
        .where(inArray(profiles.id, userIds))

    const profileMap = Object.fromEntries(profileRows.map((p) => [p.id, p]))

    let courtMap: Record<string, string> = {}
    if (xAxis === 'sport') {
        const courtIds = [...new Set(bookingRows.map((b) => b.court_id))]
        const courtRows = await db
            .select({ id: courts.id, sport: courts.sport })
            .from(courts)
            .where(inArray(courts.id, courtIds))
        courtMap = Object.fromEntries(courtRows.map((c) => [c.id, c.sport]))
    }

    const map: Record<string, { Male: number; Female: number }> = {}

    for (const b of bookingRows) {
        const profile = profileMap[b.user_id]
        if (branch !== 'Overall' && profile?.branch !== branch) continue

        const key =
            xAxis === 'sport' ? courtMap[b.court_id] || 'Unknown' : profile?.year || 'Unknown'

        if (!map[key]) map[key] = { Male: 0, Female: 0 }
        const gender = profile?.gender || ''
        if (gender === 'Male') map[key].Male++
        else if (gender === 'Female') map[key].Female++
    }

    return Object.entries(map)
        .map(([label, counts]) => ({ label, ...counts }))
        .sort((a, b) => b.Male + b.Female - (a.Male + a.Female))
}

export async function getAdminLeaderboard(startDate?: string, endDate?: string) {
    await requireAdmin()
    if (!startDate && !endDate) {
        // Run the monthly reset RPC (idempotent — safe to call every render)
        const resetRows = await db.execute<{ result: { reset_count: number; top5_ids: string[] } }>(
            sql`SELECT reset_monthly_points() as result`
        )
        const resetResult = (resetRows as any)[0]?.result as
            | { reset_count: number; top5_ids: string[] }
            | undefined

        if (
            (resetResult?.reset_count ?? 0) > 0 &&
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

        const data = await db
            .select({
                id: profiles.id,
                full_name: profiles.full_name,
                branch: profiles.branch,
                year: profiles.year,
                gender: profiles.gender,
                points: profiles.points,
            })
            .from(profiles)
            .where(eq(profiles.role, 'student'))
            .orderBy(desc(profiles.points))

        return data.map((s, i) => ({ ...s, rank: i + 1, sessions: undefined }))
    }

    const bookingConditions = [eq(bookings.status, 'completed'), eq(bookings.is_maintenance, false)]
    if (startDate) bookingConditions.push(gte(bookings.start_time, new Date(startDate)))
    if (endDate) bookingConditions.push(lte(bookings.start_time, new Date(endDate + 'T23:59:59')))

    const bookingRows = await db
        .select({ user_id: bookings.user_id })
        .from(bookings)
        .where(and(...bookingConditions))

    if (!bookingRows) return []

    const sessionCount: Record<string, number> = {}
    for (const b of bookingRows) {
        sessionCount[b.user_id] = (sessionCount[b.user_id] || 0) + 1
    }

    if (Object.keys(sessionCount).length === 0) return []

    const profileRows = await db
        .select({
            id: profiles.id,
            full_name: profiles.full_name,
            branch: profiles.branch,
            year: profiles.year,
            gender: profiles.gender,
            points: profiles.points,
        })
        .from(profiles)
        .where(inArray(profiles.id, Object.keys(sessionCount)))

    return (profileRows || [])
        .map((p: any) => ({ ...p, sessions: sessionCount[p.id] || 0 }))
        .sort((a: any, b: any) => b.sessions - a.sessions || b.points - a.points)
        .map((s: any, i: number) => ({ ...s, rank: i + 1 }))
}

export async function getBranches(): Promise<string[]> {
    await requireAdmin()
    const rows = await db
        .select({ branch: profiles.branch })
        .from(profiles)
        .where(and(eq(profiles.role, 'student'), sql`${profiles.branch} is not null`))

    return [
        ...new Set<string>(
            (rows || [])
                .map((p: { branch: string | null }) => p.branch)
                .filter((b: string | null): b is string => Boolean(b))
        ),
    ]
}
