import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')
vi.mock('@/utils/supabase/admin')

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

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
    beforeEach(() => vi.clearAllMocks())

    it('returns all vendors and aggregated totals', async () => {
        const db = makeMockDb()
        const equipment = [
            { name: 'Racket', sport: 'badminton', cost: 500, condition: 'good', vendor_name: 'Yonex', total_usage_count: 10 },
            { name: 'Net', sport: 'badminton', cost: 300, condition: 'good', vendor_name: 'Victor', total_usage_count: 5 },
        ]
        // First call: get all vendors (unfiltered)
        db.mockTableOnce('equipment', { data: equipment, error: null })
        // Second call: get equipment (possibly filtered)
        db.mockTableOnce('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFinancialsData()

        expect(result.total).toBe(2)
        expect(result.vendors).toContain('Yonex')
        expect(result.vendors).toContain('Victor')
        expect(result.totalCost).toBe(800)
        expect(result.countBySport.badminton).toBe(2)
    })

    it('calculates avgLifespanSessions from damaged/lost items only', async () => {
        const db = makeMockDb()
        const equipment = [
            { name: 'R1', sport: 'tennis', cost: 100, condition: 'damaged', vendor_name: null, total_usage_count: 20 },
            { name: 'R2', sport: 'tennis', cost: 100, condition: 'lost', vendor_name: null, total_usage_count: 40 },
            { name: 'R3', sport: 'tennis', cost: 100, condition: 'good', vendor_name: null, total_usage_count: 5 },
        ]
        db.mockTableOnce('equipment', { data: equipment, error: null })
        db.mockTableOnce('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFinancialsData()

        // avg of 20 + 40 = 60 / 2 = 30
        expect(result.avgLifespanSessions).toBe(30)
    })

    it('returns null avgLifespanSessions when no damaged/lost items', async () => {
        const db = makeMockDb()
        const equipment = [
            { name: 'R1', sport: 'tennis', cost: 100, condition: 'good', vendor_name: null, total_usage_count: 10 },
        ]
        db.mockTableOnce('equipment', { data: equipment, error: null })
        db.mockTableOnce('equipment', { data: equipment, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFinancialsData()
        expect(result.avgLifespanSessions).toBeNull()
    })

    it('returns empty result on DB error', async () => {
        const db = makeMockDb()
        // First call ok (vendors), second call fails
        db.mockTableOnce('equipment', { data: [], error: null })
        db.mockTableOnce('equipment', { data: null, error: { message: 'DB error' } })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFinancialsData()
        expect(result.total).toBe(0)
        expect(result.totalCost).toBe(0)
    })

    it('filters by vendor when vendor param provided', async () => {
        const db = makeMockDb()
        const allEquip = [
            { name: 'R1', sport: 'badminton', cost: 100, condition: 'good', vendor_name: 'Yonex', total_usage_count: 0 },
            { name: 'R2', sport: 'tennis', cost: 200, condition: 'good', vendor_name: 'Wilson', total_usage_count: 0 },
        ]
        const filtered = [allEquip[0]]
        db.mockTableOnce('equipment', { data: allEquip, error: null })
        db.mockTableOnce('equipment', { data: filtered, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getFinancialsData('Yonex')
        expect(result.total).toBe(1)
        expect(result.vendors).toHaveLength(2) // vendors list is always unfiltered
    })
})

// ─── getTeamPerformanceData ───────────────────────────────────────────────────

describe('getTeamPerformanceData', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns empty data when sport is not provided', async () => {
        const adminDb = makeMockDb()
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getTeamPerformanceData()
        expect(result.practiceSessions).toBe(0)
        expect(result.monthlyPractice).toEqual([])
    })

    it('returns empty data when sport is "all"', async () => {
        const adminDb = makeMockDb()
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getTeamPerformanceData('all')
        expect(result.practiceSessions).toBe(0)
    })

    it('returns empty data when no courts for sport', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('courts', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getTeamPerformanceData('badminton')
        expect(result.practiceSessions).toBe(0)
        expect(result.monthlyPractice).toEqual([])
    })

    it('counts practice sessions and groups by month', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('courts', { data: [{ id: 'c-1' }, { id: 'c-2' }], error: null })

        const bookings = [
            { id: 'b1', start_time: '2025-01-15T10:00:00Z' },
            { id: 'b2', start_time: '2025-01-20T10:00:00Z' },
            { id: 'b3', start_time: '2025-02-05T10:00:00Z' },
        ]
        adminDb.mockTableOnce('bookings', { data: bookings, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getTeamPerformanceData('badminton')
        expect(result.practiceSessions).toBe(3)
        expect(result.monthlyPractice).toHaveLength(2)
        // Jan comes before Feb
        expect(result.monthlyPractice[0].count).toBe(2)
        expect(result.monthlyPractice[1].count).toBe(1)
    })

    it('applies date range filters when provided', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('courts', { data: [{ id: 'c-1' }], error: null })
        adminDb.mockTableOnce('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getTeamPerformanceData('tennis', '2025-01-01', '2025-01-31')
        expect(result.practiceSessions).toBe(0)
    })
})

// ─── getWelfareTopStats ───────────────────────────────────────────────────────

describe('getWelfareTopStats', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns successfulBookings and participationPct', async () => {
        const adminDb = makeMockDb()
        // Promise.all: bookings count, then active bookings user_ids
        adminDb.mockTableOnce('bookings', { data: null, error: null, count: 15 })
        adminDb.mockTableOnce('bookings', {
            data: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u1' }], // 2 unique
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const regularDb = makeMockDb()
        regularDb.mockTable('profiles', { data: null, error: null, count: 10 })
        vi.mocked(createClient).mockResolvedValue(regularDb.client as any)

        const result = await getWelfareTopStats()
        expect(result.successfulBookings).toBe(15)
        // 2 unique / 10 total = 20%
        expect(result.participationPct).toBe(20)
    })

    it('returns 0 participationPct when no students', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', { data: null, error: null, count: 0 })
        adminDb.mockTableOnce('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const regularDb = makeMockDb()
        regularDb.mockTable('profiles', { data: null, error: null, count: 0 })
        vi.mocked(createClient).mockResolvedValue(regularDb.client as any)

        const result = await getWelfareTopStats()
        expect(result.participationPct).toBe(0)
    })
})

// ─── getParticipationStats ────────────────────────────────────────────────────

describe('getParticipationStats', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns empty result when no bookings', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getParticipationStats('branch')
        expect(result.barData).toEqual([])
        expect(result.genderData).toEqual({ Male: 0, Female: 0 })
    })

    it('groups bookings by branch', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [
                { id: 'b1', user_id: 'u1', court_id: 'c1' },
                { id: 'b2', user_id: 'u2', court_id: 'c1' },
                { id: 'b3', user_id: 'u1', court_id: 'c2' },
            ],
            error: null,
        })
        adminDb.mockTableOnce('profiles', {
            data: [
                { id: 'u1', branch: 'CSE', gender: 'Male', year: '2' },
                { id: 'u2', branch: 'ECE', gender: 'Female', year: '3' },
            ],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getParticipationStats('branch')
        expect(result.barData).toHaveLength(2)
        const cse = result.barData.find((d) => d.label === 'CSE')
        expect(cse?.count).toBe(2) // u1 has 2 bookings
        expect(result.genderData.Male).toBe(2)
        expect(result.genderData.Female).toBe(1)
    })

    it('groups bookings by year', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [{ id: 'b1', user_id: 'u1', court_id: 'c1' }],
            error: null,
        })
        adminDb.mockTableOnce('profiles', {
            data: [{ id: 'u1', branch: 'CSE', gender: 'Male', year: '2' }],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getParticipationStats('year')
        expect(result.barData[0].label).toBe('2')
    })

    it('groups bookings by sport and fetches courts', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [{ id: 'b1', user_id: 'u1', court_id: 'c1' }],
            error: null,
        })
        adminDb.mockTableOnce('profiles', {
            data: [{ id: 'u1', branch: 'CSE', gender: 'Male', year: '2' }],
            error: null,
        })
        adminDb.mockTableOnce('courts', {
            data: [{ id: 'c1', sport: 'badminton' }],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getParticipationStats('sport')
        expect(result.barData[0].label).toBe('badminton')
    })

    it('applies date range filters', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getParticipationStats('branch', '2025-01-01', '2025-12-31')
        expect(result.barData).toEqual([])
    })
})

// ─── getBranchProfileData ─────────────────────────────────────────────────────

describe('getBranchProfileData', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns empty array when no bookings', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getBranchProfileData('CSE', 'sport')
        expect(result).toEqual([])
    })

    it('groups by sport with male/female counts for a specific branch', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [
                { id: 'b1', user_id: 'u1', court_id: 'c1' },
                { id: 'b2', user_id: 'u2', court_id: 'c1' },
                { id: 'b3', user_id: 'u3', court_id: 'c2' }, // different branch
            ],
            error: null,
        })
        adminDb.mockTableOnce('profiles', {
            data: [
                { id: 'u1', branch: 'CSE', gender: 'Male', year: '2' },
                { id: 'u2', branch: 'CSE', gender: 'Female', year: '3' },
                { id: 'u3', branch: 'ECE', gender: 'Male', year: '1' },
            ],
            error: null,
        })
        adminDb.mockTableOnce('courts', {
            data: [
                { id: 'c1', sport: 'badminton' },
                { id: 'c2', sport: 'tennis' },
            ],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getBranchProfileData('CSE', 'sport')
        expect(result).toHaveLength(1) // only badminton for CSE
        expect(result[0].label).toBe('badminton')
        expect(result[0].Male).toBe(1)
        expect(result[0].Female).toBe(1)
    })

    it('includes all branches when branch is "Overall"', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [
                { id: 'b1', user_id: 'u1', court_id: 'c1' },
                { id: 'b2', user_id: 'u2', court_id: 'c1' },
            ],
            error: null,
        })
        adminDb.mockTableOnce('profiles', {
            data: [
                { id: 'u1', branch: 'CSE', gender: 'Male', year: '2' },
                { id: 'u2', branch: 'ECE', gender: 'Female', year: '3' },
            ],
            error: null,
        })
        adminDb.mockTableOnce('courts', {
            data: [{ id: 'c1', sport: 'badminton' }],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getBranchProfileData('Overall', 'sport')
        expect(result[0].Male).toBe(1)
        expect(result[0].Female).toBe(1)
    })

    it('groups by year when xAxis is "year"', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTableOnce('bookings', {
            data: [{ id: 'b1', user_id: 'u1', court_id: 'c1' }],
            error: null,
        })
        adminDb.mockTableOnce('profiles', {
            data: [{ id: 'u1', branch: 'CSE', gender: 'Male', year: '2' }],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const result = await getBranchProfileData('CSE', 'year')
        expect(result[0].label).toBe('2')
        expect(result[0].Male).toBe(1)
    })
})

// ─── getAdminLeaderboard ──────────────────────────────────────────────────────

describe('getAdminLeaderboard', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns ranked profiles ordered by points when no date range', async () => {
        const adminDb = makeMockDb()
        adminDb.rpc.mockResolvedValue({ data: null, error: null })
        adminDb.mockTable('profiles', {
            data: [
                { id: 'u1', full_name: 'Alice', branch: 'CSE', year: '2', gender: 'Female', points: 100 },
                { id: 'u2', full_name: 'Bob', branch: 'ECE', year: '3', gender: 'Male', points: 80 },
            ],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)
        vi.mocked(createClient).mockResolvedValue(makeMockDb().client as any)

        const result = await getAdminLeaderboard()
        expect(result).toHaveLength(2)
        expect(result[0].rank).toBe(1)
        expect(result[1].rank).toBe(2)
        expect(adminDb.rpc).toHaveBeenCalledWith('reset_monthly_points')
    })

    it('returns ranked by sessions when date range provided', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', {
            data: [
                { user_id: 'u1' },
                { user_id: 'u1' },
                { user_id: 'u2' },
            ],
            error: null,
        })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)

        const regularDb = makeMockDb()
        regularDb.mockTable('profiles', {
            data: [
                { id: 'u1', full_name: 'Alice', branch: 'CSE', year: '2', gender: 'Female', points: 100 },
                { id: 'u2', full_name: 'Bob', branch: 'ECE', year: '3', gender: 'Male', points: 80 },
            ],
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(regularDb.client as any)

        const result = await getAdminLeaderboard('2025-01-01', '2025-01-31')
        expect(result).toHaveLength(2)
        expect(result[0].sessions).toBe(2) // u1 has 2 sessions
        expect(result[0].rank).toBe(1)
    })

    it('returns empty array when no bookings in date range', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: [], error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)
        vi.mocked(createClient).mockResolvedValue(makeMockDb().client as any)

        const result = await getAdminLeaderboard('2025-01-01', '2025-01-31')
        expect(result).toEqual([])
    })

    it('returns empty array when bookings data is null', async () => {
        const adminDb = makeMockDb()
        adminDb.mockTable('bookings', { data: null, error: null })
        vi.mocked(createAdminClient).mockReturnValue(adminDb.client as any)
        vi.mocked(createClient).mockResolvedValue(makeMockDb().client as any)

        const result = await getAdminLeaderboard('2025-01-01', '2025-01-31')
        expect(result).toEqual([])
    })
})

// ─── getBranches ──────────────────────────────────────────────────────────────

describe('getBranches', () => {
    beforeEach(() => vi.clearAllMocks())

    it('returns unique branch names', async () => {
        const db = makeMockDb()
        db.mockTable('profiles', {
            data: [
                { branch: 'CSE' },
                { branch: 'ECE' },
                { branch: 'CSE' }, // duplicate
            ],
            error: null,
        })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBranches()
        expect(result).toHaveLength(2)
        expect(result).toContain('CSE')
        expect(result).toContain('ECE')
    })

    it('returns empty array when no profiles', async () => {
        const db = makeMockDb()
        db.mockTable('profiles', { data: [], error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBranches()
        expect(result).toEqual([])
    })

    it('returns empty array when data is null', async () => {
        const db = makeMockDb()
        db.mockTable('profiles', { data: null, error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        const result = await getBranches()
        expect(result).toEqual([])
    })
})
