
// Adjustable by host (defaults and constraints)
export const GAME_SETTINGS = {
    DEFAULT_WORD_LIMIT: 3,
    MIN_WORD_LIMIT: 1,
    MAX_WORD_LIMIT: 5,

    DEFAULT_TURN_TIME: 30,
    MIN_TURN_TIME: 10,
    MAX_TURN_TIME: 60,
    TURN_TIME_INCREMENT: 5,
} as const;

// Immutable game rules
export const GAME_RULES = {
    MIN_PLAYERS: 2,
    MAX_PLAYERS: 20,
    MAX_NAME_LENGTH: 12,
    ROOM_CODE_LENGTH: 6,
} as const;

// Timer constants (in milliseconds)
export const TIMERS = {
    HEARTBEAT_INTERVAL: 10_000,  // 10 seconds
    DISCONNECT_TIMEOUT: 30_000,  // 30 seconds
} as const;

export const PLAYER_COLORS = [
    '#60A5FA', // Blue (brighter)
    '#F87171', // Red (brighter)
    '#34D399', // Green (brighter)
    '#A78BFA', // Purple (brighter)
    '#FBBF24', // Amber (brighter)
    '#2DD4BF', // Teal (brighter)
    '#F472B6', // Pink (brighter)
    '#818CF8', // Indigo (brighter)
    '#38BDF8', // Sky (brighter)
    '#FCD34D', // Yellow (brighter)
    '#C4B5FD', // Violet (brighter)
    '#5EEAD4', // Cyan (brighter)
] as const;

export const LEADERBOARD = {
    FAST_THRESHOLD_MS: 5000,      // <= 5 seconds
    VERY_FAST_THRESHOLD_MS: 2000, // <= 2 seconds
} as const;
