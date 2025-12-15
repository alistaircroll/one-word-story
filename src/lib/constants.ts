
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
    '#1E40AF', // Blue
    '#B91C1C', // Red
    '#047857', // Green
    '#7C3AED', // Purple
    '#B45309', // Amber
    '#0F766E', // Teal
    '#BE185D', // Pink
    '#4338CA', // Indigo
    '#0369A1', // Sky
    '#A16207', // Yellow-dark
    '#6D28D9', // Violet
    '#115E59', // Cyan-dark
] as const;
