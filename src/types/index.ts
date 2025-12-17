export type GameStatus = "LOBBY" | "PLAYING" | "PAUSED" | "LOCKED" | "ENDED";

export interface GameSettings {
    wordLimit: number;
    turnTimeLimit: number;
}

export interface Player {
    id: string; // The key in the players object, but useful to have here too if passed around
    name: string;
    color: string;
    isActive: boolean;
    lastSeen: number;
    // Stats
    totalResponseTime?: number;
    turnCount?: number;
    lastTurnTime?: number | null;
}

export interface StorySegment {
    id: string;
    text: string;
    authorId: string; // "HOST" if edited by host
    color: string;
    timestamp: number;
    metadata?: {
        responseTime?: number;
    };
}

export interface GameState {
    status: GameStatus;
    currentPlayerId: string | null;
    turnBag: string[];
    lastPlayerId: string | null;
    timer: number;
    timerStartedAt: number | null;
    settings: GameSettings;
    story: StorySegment[] | null; // Firebase returns null/undefined for empty arrays sometimes, careful
    players: Record<string, Player> | null;
}
