/**
 * Sport code mapping for equipment ID generation
 */
export const SPORT_CODES: Record<string, string> = {
    badminton: 'bad',
    tennis: 'ten',
    squash: 'squ',
    cricket: 'cri',
    football: 'foo',
    'table tennis': 'tab',
    volleyball: 'vol',
    basketball: 'bas',
    pool: 'poo',
    snooker: 'sno',
}

/**
 * Sport code mapping for court ID generation
 * Using 'C' prefix to differentiate from equipment (e.g., C-BAD1)
 */
export const COURT_CODES: Record<string, string> = {
    badminton: 'BAD',
    tennis: 'TEN',
    squash: 'SQU',
    cricket: 'CRI',
    football: 'FOO',
    'table tennis': 'TAB',
    volleyball: 'VOL',
    basketball: 'BAS',
    pool: 'POO',
    snooker: 'SNO',
}

/**
 * All available sports in the system
 */
export const SPORTS_LIST = [
    'badminton',
    'tennis',
    'squash',
    'cricket',
    'football',
    'table tennis',
    'volleyball',
    'basketball',
    'pool',
    'snooker',
] as const

export type Sport = (typeof SPORTS_LIST)[number]

/**
 * Generate the next equipment ID for a given sport
 * Format: #{sport_code}{number} (e.g., #bad1, #bad2, #ten1)
 */
export function generateEquipmentId(sport: string, currentCount: number): string {
    const code = SPORT_CODES[sport.toLowerCase()]
    if (!code) {
        throw new Error(`Unknown sport: ${sport}`)
    }
    return `#${code}${currentCount + 1}`
}

/**
 * Generate the next court ID for a given sport
 * Format: C-{SPORT_CODE}{number} (e.g., C-BAD1, C-BAD2, C-TEN1)
 */
export function generateCourtId(sport: string, currentCount: number): string {
    const code = COURT_CODES[sport.toLowerCase()]
    if (!code) {
        throw new Error(`Unknown sport: ${sport}`)
    }
    return `C-${code}${currentCount + 1}`
}
