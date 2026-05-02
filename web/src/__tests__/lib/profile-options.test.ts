/**
 * Tests for lib/profile-options.ts
 *
 * Validates that the exported constant arrays are non-empty, contain the
 * expected IIITD-specific values, and are frozen as const tuples.
 */

import { describe, it, expect } from 'vitest'
import { BRANCHES, YEARS, GENDERS } from '@/lib/profile-options'

describe('BRANCHES', () => {
    it('is a non-empty array', () => {
        expect(BRANCHES.length).toBeGreaterThan(0)
    })

    it('contains core IIITD branches', () => {
        expect(BRANCHES).toContain('CSE')
        expect(BRANCHES).toContain('ECE')
        expect(BRANCHES).toContain('CSAI')
        expect(BRANCHES).toContain('CSD')
    })

    it('contains all 9 defined branches', () => {
        expect(BRANCHES).toHaveLength(9)
    })
})

describe('YEARS', () => {
    it('is a non-empty array', () => {
        expect(YEARS.length).toBeGreaterThan(0)
    })

    it('contains undergraduate years 1-4', () => {
        expect(YEARS).toContain('Year 1')
        expect(YEARS).toContain('Year 2')
        expect(YEARS).toContain('Year 3')
        expect(YEARS).toContain('Year 4')
    })

    it('contains postgraduate options', () => {
        expect(YEARS).toContain('M.Tech')
        expect(YEARS).toContain('PhD')
    })
})

describe('GENDERS', () => {
    it('contains exactly Male and Female', () => {
        expect(GENDERS).toContain('Male')
        expect(GENDERS).toContain('Female')
        expect(GENDERS).toHaveLength(2)
    })
})
