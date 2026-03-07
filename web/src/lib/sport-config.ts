// Sport-specific player limits
// min_players: minimum required for a booking (default 2)
// max_players: maximum allowed per booking (null = no limit)

export const SPORT_PLAYER_LIMITS: Record<string, { min: number; max: number | null }> = {
    badminton: { min: 2, max: 6 },
    tennis: { min: 2, max: 6 },
    'table tennis': { min: 2, max: 4 },
    squash: { min: 2, max: 4 },
    cricket: { min: 2, max: null },
    football: { min: 2, max: null },
    volleyball: { min: 2, max: null },
    basketball: { min: 2, max: null },
    pool: { min: 2, max: null },
    snooker: { min: 2, max: null },
}

const DEFAULT_LIMITS = { min: 2, max: null }

export function getPlayerLimits(sport: string): { min: number; max: number | null } {
    const key = sport.toLowerCase().trim()
    return SPORT_PLAYER_LIMITS[key] || DEFAULT_LIMITS
}
