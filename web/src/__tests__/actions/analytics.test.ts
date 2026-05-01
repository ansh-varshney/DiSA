import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mockDrizzleDb } from '../mocks/drizzle'

vi.mock('@/lib/auth-guards', () => ({
    requireAdmin: vi.fn().mockResolvedValue({ id: 'student-1' }),
    requireManager: vi.fn().mockResolvedValue({ id: 'student-1' }),
}))

vi.mock('@/actions/notifications', () => ({
    sendNotifications: vi.fn().mockResolvedValue(undefined),
}))

import {
    getFinancialsData,
    getTeamPerformanceData,
    getWelfareTopStats,
    getParticipationStats,
    getBranchProfileData,
    getAdminLeaderboard,
    getBranches,
} from '@/actions/analytics'

// ─── getFinancialsData ────────────────────────────────────────────────────────

describe('getFinancialsData', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns all vendors and aggregated totals', async () => {
        const equipment = [
            {
                name: 'Racket',
                sport: 'badminton',
                cost: '500',
                condition: 'good',
                vendor_name: 'Yonex',
                total_usage_count: 10,
                expected_lifespan_days: null,
            },
            {
                name: 'Net',
                sport: 'badminton',
                cost: '300',
                condition: 'good',
                vendor_name: 'Victor',
                total_usage_count: 5,
                expected_lifespan_days: null,
            },
        ]
        mockDrizzleDb.enqueue(equipment.map((e) => ({ vendor_name: e.vendor_name }))) // all vendors select
        mockDrizzleDb.enqueue(equipment) // equipment select (filtered)

        const result = await getFinancialsData()
        expect(result.total).toBe(2)
        expect(result.vendors).toContain('Yonex')
        expect(result.vendors).toContain('Victor')
        expect(result.totalCost).toBe(800)
        expect(result.countBySport.badminton).toBe(2)
    })

    it('calculates avgLifespanSessions from damaged/lost items only', async () => {
        const equipment = [
            {
                name: 'R1',
                sport: 'tennis',
                cost: '100',
                condition: 'damaged',
                vendor_name: null,
                total_usage_count: 20,
                expected_lifespan_days: null,
            },
            {
                name: 'R2',
                sport: 'tennis',
                cost: '100',
                condition: 'lost',
                vendor_name: null,
                total_usage_count: 40,
                expected_lifespan_days: null,
            },
            {
                name: 'R3',
                sport: 'tennis',
                cost: '100',
                condition: 'good',
                vendor_name: null,
                total_usage_count: 5,
                expected_lifespan_days: null,
            },
        ]
        mockDrizzleDb.enqueue(equipment.map((e) => ({ vendor_name: e.vendor_name })))
        mockDrizzleDb.enqueue(equipment)

        const result = await getFinancialsData()
        expect(result.avgLifespanSessions).toBe(30) // (20+40)/2
    })

    it('returns null avgLifespanSessions when no damaged/lost items', async () => {
        const equipment = [
            {
                name: 'R1',
                sport: 'tennis',
                cost: '100',
                condition: 'good',
                vendor_name: null,
                total_usage_count: 10,
                expected_lifespan_days: null,
            },
        ]
        mockDrizzleDb.enqueue(equipment.map((e) => ({ vendor_name: e.vendor_name })))
        mockDrizzleDb.enqueue(equipment)

        expect((await getFinancialsData()).avgLifespanSessions).toBeNull()
    })

    it('returns empty result when no equipment rows', async () => {
        mockDrizzleDb.enqueue([]) // all vendors → empty
        mockDrizzleDb.enqueue([]) // equipment rows → empty

        const result = await getFinancialsData()
        expect(result.total).toBe(0)
        expect(result.totalCost).toBe(0)
    })

    it('filters by vendor when vendor param provided', async () => {
        const allVendors = [{ vendor_name: 'Yonex' }, { vendor_name: 'Wilson' }]
        const filtered = [
            {
                name: 'R1',
                sport: 'badminton',
                cost: '100',
                condition: 'good',
                vendor_name: 'Yonex',
                total_usage_count: 0,
                expected_lifespan_days: null,
            },
        ]
        mockDrizzleDb.enqueue(allVendors)
        mockDrizzleDb.enqueue(filtered)

        const result = await getFinancialsData('Yonex')
        expect(result.total).toBe(1)
        expect(result.vendors).toHaveLength(2) // vendors list is always unfiltered
    })
})

// ─── getTeamPerformanceData ───────────────────────────────────────────────────

describe('getTeamPerformanceData', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns empty data when sport is not provided', async () => {
        const result = await getTeamPerformanceData()
        expect(result.practiceSessions).toBe(0)
        expect(result.monthlyPractice).toEqual([])
    })

    it('returns empty data when sport is "all"', async () => {
        const result = await getTeamPerformanceData('all')
        expect(result.practiceSessions).toBe(0)
    })

    it('returns empty data when no courts for sport', async () => {
        mockDrizzleDb.enqueue([]) // courts → empty
        const result = await getTeamPerformanceData('badminton')
        expect(result.practiceSessions).toBe(0)
        expect(result.monthlyPractice).toEqual([])
    })

    it('counts practice sessions and groups by month', async () => {
        mockDrizzleDb.enqueue([{ id: 'c-1' }, { id: 'c-2' }]) // courts
        mockDrizzleDb.enqueue([
            { id: 'b1', start_time: new Date('2025-01-15T10:00:00Z') },
            { id: 'b2', start_time: new Date('2025-01-20T10:00:00Z') },
            { id: 'b3', start_time: new Date('2025-02-05T10:00:00Z') },
        ]) // bookings

        const result = await getTeamPerformanceData('badminton')
        expect(result.practiceSessions).toBe(3)
        expect(result.monthlyPractice).toHaveLength(2)
        expect(result.monthlyPractice[0].count).toBe(2) // Jan
        expect(result.monthlyPractice[1].count).toBe(1) // Feb
    })

    it('applies date range filters when provided', async () => {
        mockDrizzleDb.enqueue([{ id: 'c-1' }])
        mockDrizzleDb.enqueue([]) // no bookings in range
        const result = await getTeamPerformanceData('tennis', '2025-01-01', '2025-01-31')
        expect(result.practiceSessions).toBe(0)
    })
})

// ─── getWelfareTopStats ───────────────────────────────────────────────────────

describe('getWelfareTopStats', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns successfulBookings and participationPct', async () => {
        // Promise.all with 3 concurrent queries — pops in array order
        mockDrizzleDb.enqueue([{ count: 15 }]) // bookingCountRows
        mockDrizzleDb.enqueue([{ count: 10 }]) // studentCountRows
        mockDrizzleDb.enqueue([{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u1' }]) // activeBookingRows

        const result = await getWelfareTopStats()
        expect(result.successfulBookings).toBe(15)
        expect(result.participationPct).toBe(20) // 2 unique / 10 total = 20%
    })

    it('returns 0 participationPct when no students', async () => {
        mockDrizzleDb.enqueue([{ count: 0 }])
        mockDrizzleDb.enqueue([{ count: 0 }])
        mockDrizzleDb.enqueue([])

        const result = await getWelfareTopStats()
        expect(result.participationPct).toBe(0)
    })
})

// ─── getParticipationStats ────────────────────────────────────────────────────

describe('getParticipationStats', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns empty result when no bookings', async () => {
        mockDrizzleDb.enqueue([]) // bookings
        const result = await getParticipationStats('branch')
        expect(result.barData).toEqual([])
        expect(result.genderData).toEqual({ Male: 0, Female: 0 })
    })

    it('groups bookings by branch', async () => {
        mockDrizzleDb.enqueue([
            { id: 'b1', user_id: 'u1', court_id: 'c1' },
            { id: 'b2', user_id: 'u2', court_id: 'c1' },
            { id: 'b3', user_id: 'u1', court_id: 'c2' },
        ]) // bookings
        mockDrizzleDb.enqueue([
            { id: 'u1', branch: 'CSE', gender: 'Male', year: '2' },
            { id: 'u2', branch: 'ECE', gender: 'Female', year: '3' },
        ]) // profiles

        const result = await getParticipationStats('branch')
        expect(result.barData).toHaveLength(2)
        const cse = result.barData.find((d) => d.label === 'CSE')
        expect(cse?.count).toBe(2)
        expect(result.genderData.Male).toBe(2)
        expect(result.genderData.Female).toBe(1)
    })

    it('groups bookings by year', async () => {
        mockDrizzleDb.enqueue([{ id: 'b1', user_id: 'u1', court_id: 'c1' }])
        mockDrizzleDb.enqueue([{ id: 'u1', branch: 'CSE', gender: 'Male', year: '2' }])

        const result = await getParticipationStats('year')
        expect(result.barData[0].label).toBe('2')
    })

    it('groups bookings by sport and fetches courts', async () => {
        mockDrizzleDb.enqueue([{ id: 'b1', user_id: 'u1', court_id: 'c1' }])
        mockDrizzleDb.enqueue([{ id: 'u1', branch: 'CSE', gender: 'Male', year: '2' }])
        mockDrizzleDb.enqueue([{ id: 'c1', sport: 'badminton' }]) // courts

        const result = await getParticipationStats('sport')
        expect(result.barData[0].label).toBe('badminton')
    })

    it('applies date range filters', async () => {
        mockDrizzleDb.enqueue([])
        const result = await getParticipationStats('branch', '2025-01-01', '2025-12-31')
        expect(result.barData).toEqual([])
    })
})

// ─── getBranchProfileData ─────────────────────────────────────────────────────

describe('getBranchProfileData', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns empty array when no bookings', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getBranchProfileData('CSE', 'sport')).toEqual([])
    })

    it('groups by sport with male/female counts for a specific branch', async () => {
        mockDrizzleDb.enqueue([
            { id: 'b1', user_id: 'u1', court_id: 'c1' },
            { id: 'b2', user_id: 'u2', court_id: 'c1' },
            { id: 'b3', user_id: 'u3', court_id: 'c2' },
        ])
        mockDrizzleDb.enqueue([
            { id: 'u1', branch: 'CSE', gender: 'Male', year: '2' },
            { id: 'u2', branch: 'CSE', gender: 'Female', year: '3' },
            { id: 'u3', branch: 'ECE', gender: 'Male', year: '1' },
        ])
        mockDrizzleDb.enqueue([
            { id: 'c1', sport: 'badminton' },
            { id: 'c2', sport: 'tennis' },
        ])

        const result = await getBranchProfileData('CSE', 'sport')
        expect(result).toHaveLength(1) // only badminton for CSE
        expect(result[0].label).toBe('badminton')
        expect(result[0].Male).toBe(1)
        expect(result[0].Female).toBe(1)
    })

    it('includes all branches when branch is "Overall"', async () => {
        mockDrizzleDb.enqueue([
            { id: 'b1', user_id: 'u1', court_id: 'c1' },
            { id: 'b2', user_id: 'u2', court_id: 'c1' },
        ])
        mockDrizzleDb.enqueue([
            { id: 'u1', branch: 'CSE', gender: 'Male', year: '2' },
            { id: 'u2', branch: 'ECE', gender: 'Female', year: '3' },
        ])
        mockDrizzleDb.enqueue([{ id: 'c1', sport: 'badminton' }])

        const result = await getBranchProfileData('Overall', 'sport')
        expect(result[0].Male).toBe(1)
        expect(result[0].Female).toBe(1)
    })

    it('groups by year when xAxis is "year"', async () => {
        mockDrizzleDb.enqueue([{ id: 'b1', user_id: 'u1', court_id: 'c1' }])
        mockDrizzleDb.enqueue([{ id: 'u1', branch: 'CSE', gender: 'Male', year: '2' }])
        // no courts fetch for year xAxis

        const result = await getBranchProfileData('CSE', 'year')
        expect(result[0].label).toBe('2')
        expect(result[0].Male).toBe(1)
    })

    it('passes endDate filter through to the booking query (covers line 317)', async () => {
        // The endDate branch appends a lte condition — we verify the query runs without error
        mockDrizzleDb.enqueue([]) // no bookings in range

        const result = await getBranchProfileData('Overall', 'sport', undefined, '2024-12-31')

        expect(result).toEqual([])
    })

    it('sorts results by total count descending (covers line 361)', async () => {
        // 2 sports: badminton has 1 booking, tennis has 3 → tennis should come first
        mockDrizzleDb.enqueue([
            { id: 'b1', user_id: 'u1', court_id: 'c-bad' },
            { id: 'b2', user_id: 'u2', court_id: 'c-ten' },
            { id: 'b3', user_id: 'u3', court_id: 'c-ten' },
            { id: 'b4', user_id: 'u4', court_id: 'c-ten' },
        ])
        mockDrizzleDb.enqueue([
            { id: 'u1', branch: 'CSE', gender: 'Male', year: '1' },
            { id: 'u2', branch: 'CSE', gender: 'Female', year: '1' },
            { id: 'u3', branch: 'CSE', gender: 'Male', year: '2' },
            { id: 'u4', branch: 'CSE', gender: 'Female', year: '2' },
        ])
        mockDrizzleDb.enqueue([
            { id: 'c-bad', sport: 'badminton' },
            { id: 'c-ten', sport: 'tennis' },
        ])

        const result = await getBranchProfileData('Overall', 'sport')

        expect(result[0].label).toBe('tennis') // 3 total → first
        expect(result[1].label).toBe('badminton') // 1 total → second
    })
})

// ─── getAdminLeaderboard ──────────────────────────────────────────────────────

describe('getAdminLeaderboard', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns ranked profiles ordered by points when no date range', async () => {
        // execute reset_monthly_points → no reset (reset_count=0)
        mockDrizzleDb.execute = vi
            .fn()
            .mockResolvedValue([{ result: { reset_count: 0, top5_ids: [] } }])
        mockDrizzleDb.enqueue([
            {
                id: 'u1',
                full_name: 'Alice',
                branch: 'CSE',
                year: '2',
                gender: 'Female',
                points: 100,
            },
            { id: 'u2', full_name: 'Bob', branch: 'ECE', year: '3', gender: 'Male', points: 80 },
        ])

        const result = await getAdminLeaderboard()
        expect(result).toHaveLength(2)
        expect(result[0].rank).toBe(1)
        expect(result[1].rank).toBe(2)
    })

    it('sends notifications when monthly reset resets scores', async () => {
        const { sendNotifications } = await import('@/actions/notifications')
        mockDrizzleDb.execute = vi
            .fn()
            .mockResolvedValue([
                { result: { reset_count: 5, top5_ids: ['u1', 'u2', 'u3', 'u4', 'u5'] } },
            ])
        // sendNotifications for top5 (mocked via module mock)
        mockDrizzleDb.enqueue([
            { id: 'u1', full_name: 'Alice', branch: 'CSE', year: '2', gender: 'Female', points: 0 },
        ])

        await getAdminLeaderboard()
        expect(vi.mocked(sendNotifications)).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ type: 'priority_booking_awarded' })])
        )
    })

    it('returns ranked by sessions when date range provided', async () => {
        mockDrizzleDb.enqueue([{ user_id: 'u1' }, { user_id: 'u1' }, { user_id: 'u2' }])
        mockDrizzleDb.enqueue([
            {
                id: 'u1',
                full_name: 'Alice',
                branch: 'CSE',
                year: '2',
                gender: 'Female',
                points: 100,
            },
            { id: 'u2', full_name: 'Bob', branch: 'ECE', year: '3', gender: 'Male', points: 80 },
        ])

        const result = await getAdminLeaderboard('2025-01-01', '2025-01-31')
        expect(result).toHaveLength(2)
        expect(result[0].sessions).toBe(2)
        expect(result[0].rank).toBe(1)
    })

    it('returns empty array when no bookings in date range', async () => {
        mockDrizzleDb.enqueue([]) // no bookings
        expect(await getAdminLeaderboard('2025-01-01', '2025-01-31')).toEqual([])
    })
})

// ─── getBranches ──────────────────────────────────────────────────────────────

describe('getBranches', () => {
    beforeEach(() => mockDrizzleDb.reset())

    it('returns unique branch names', async () => {
        mockDrizzleDb.enqueue([{ branch: 'CSE' }, { branch: 'ECE' }, { branch: 'CSE' }])
        const result = await getBranches()
        expect(result).toHaveLength(2)
        expect(result).toContain('CSE')
        expect(result).toContain('ECE')
    })

    it('returns empty array when no profiles', async () => {
        mockDrizzleDb.enqueue([])
        expect(await getBranches()).toEqual([])
    })

    it('filters out null branches', async () => {
        mockDrizzleDb.enqueue([{ branch: 'CSE' }, { branch: null }])
        const result = await getBranches()
        expect(result).toHaveLength(1)
        expect(result[0]).toBe('CSE')
    })
})
