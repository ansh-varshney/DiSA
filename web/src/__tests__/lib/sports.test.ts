import { describe, it, expect } from 'vitest'
import {
    generateEquipmentId,
    generateCourtId,
    SPORT_CODES,
    COURT_CODES,
    SPORTS_LIST,
} from '@/lib/sports'

describe('generateEquipmentId', () => {
    it('generates correct id for badminton at count 0', () => {
        expect(generateEquipmentId('badminton', 0)).toBe('#bad1')
    })

    it('generates correct id for tennis at count 5', () => {
        expect(generateEquipmentId('tennis', 5)).toBe('#ten6')
    })

    it('is case-insensitive', () => {
        expect(generateEquipmentId('Badminton', 0)).toBe('#bad1')
        expect(generateEquipmentId('TENNIS', 2)).toBe('#ten3')
    })

    it('throws for unknown sport', () => {
        expect(() => generateEquipmentId('hockey', 0)).toThrow('Unknown sport: hockey')
    })

    it('generates correct ids for all supported sports', () => {
        for (const sport of SPORTS_LIST) {
            const code = SPORT_CODES[sport]
            expect(generateEquipmentId(sport, 0)).toBe(`#${code}1`)
            expect(generateEquipmentId(sport, 9)).toBe(`#${code}10`)
        }
    })

    it('handles table tennis (two-word sport)', () => {
        expect(generateEquipmentId('table tennis', 0)).toBe('#tab1')
    })

    it('handles pool and snooker', () => {
        expect(generateEquipmentId('pool', 0)).toBe('#poo1')
        expect(generateEquipmentId('snooker', 0)).toBe('#sno1')
    })
})

describe('generateCourtId', () => {
    it('generates correct id for badminton at count 0', () => {
        expect(generateCourtId('badminton', 0)).toBe('C-BAD1')
    })

    it('generates correct id for football at count 2', () => {
        expect(generateCourtId('football', 2)).toBe('C-FOO3')
    })

    it('is case-insensitive', () => {
        expect(generateCourtId('Tennis', 0)).toBe('C-TEN1')
        expect(generateCourtId('SQUASH', 1)).toBe('C-SQU2')
    })

    it('throws for unknown sport', () => {
        expect(() => generateCourtId('hockey', 0)).toThrow('Unknown sport: hockey')
    })

    it('generates correct ids for all supported sports', () => {
        for (const sport of SPORTS_LIST) {
            const code = COURT_CODES[sport]
            expect(generateCourtId(sport, 0)).toBe(`C-${code}1`)
            expect(generateCourtId(sport, 9)).toBe(`C-${code}10`)
        }
    })

    it('handles table tennis (two-word sport)', () => {
        expect(generateCourtId('table tennis', 0)).toBe('C-TAB1')
    })

    it('handles basketball and volleyball', () => {
        expect(generateCourtId('basketball', 0)).toBe('C-BAS1')
        expect(generateCourtId('volleyball', 0)).toBe('C-VOL1')
    })
})

describe('SPORTS_LIST', () => {
    it('contains exactly 10 sports', () => {
        expect(SPORTS_LIST).toHaveLength(10)
    })

    it('contains expected sports', () => {
        expect(SPORTS_LIST).toContain('badminton')
        expect(SPORTS_LIST).toContain('cricket')
        expect(SPORTS_LIST).toContain('table tennis')
    })
})

describe('SPORT_CODES', () => {
    it('has an entry for every sport in SPORTS_LIST', () => {
        for (const sport of SPORTS_LIST) {
            expect(SPORT_CODES[sport]).toBeTruthy()
        }
    })
})

describe('COURT_CODES', () => {
    it('has an entry for every sport in SPORTS_LIST', () => {
        for (const sport of SPORTS_LIST) {
            expect(COURT_CODES[sport]).toBeTruthy()
        }
    })
})
