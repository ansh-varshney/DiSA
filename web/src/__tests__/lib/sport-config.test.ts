import { describe, it, expect } from 'vitest'
import { getPlayerLimits, SPORT_PLAYER_LIMITS } from '@/lib/sport-config'

describe('getPlayerLimits', () => {
    it('returns correct limits for badminton', () => {
        expect(getPlayerLimits('badminton')).toEqual({ min: 2, max: 6 })
    })

    it('returns correct limits for table tennis', () => {
        expect(getPlayerLimits('table tennis')).toEqual({ min: 2, max: 4 })
    })

    it('returns correct limits for football (no max)', () => {
        const limits = getPlayerLimits('football')
        expect(limits.min).toBe(2)
        expect(limits.max).toBeNull()
    })

    it('is case-insensitive', () => {
        expect(getPlayerLimits('BADMINTON')).toEqual(getPlayerLimits('badminton'))
        expect(getPlayerLimits('Badminton')).toEqual(getPlayerLimits('badminton'))
    })

    it('trims whitespace', () => {
        expect(getPlayerLimits('  badminton  ')).toEqual(getPlayerLimits('badminton'))
    })

    it('returns default { min:2, max:null } for unknown sport', () => {
        expect(getPlayerLimits('underwater_chess')).toEqual({ min: 2, max: null })
    })

    it('covers all defined sports and min is always ≥ 2', () => {
        for (const [sport, limits] of Object.entries(SPORT_PLAYER_LIMITS)) {
            expect(limits.min, `${sport} min`).toBeGreaterThanOrEqual(2)
            if (limits.max !== null) {
                expect(limits.max, `${sport} max >= min`).toBeGreaterThanOrEqual(limits.min)
            }
        }
    })
})
