import { db } from "@/lib/firebase";
import { ref, set, get, child, update, onValue, off } from "firebase/database";
import { GameState, Player, GameStatus } from "@/types";
import { GAME_SETTINGS } from "@/lib/constants";
import { v4 as uuidv4 } from 'uuid';

// Helper to generate a random 6-character room code
function generateRoomCode(): string {
    const chars = "ABCDEFHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous chars like I, O, 1, 0
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export const gameService = {
    // Create a new game
    async createGame(): Promise<string> {
        const gameId = generateRoomCode();
        const gameRef = ref(db, `games/${gameId}`);

        // Check if collision (unlikely but possible)
        const snapshot = await get(gameRef);
        if (snapshot.exists()) {
            return this.createGame(); // Retry recursively
        }


        const initialGameState: GameState = {
            status: "LOBBY",
            currentPlayerId: null,
            turnBag: [],
            lastPlayerId: null,
            timer: 0,
            timerStartedAt: null,
            settings: {
                wordLimit: GAME_SETTINGS.DEFAULT_WORD_LIMIT,
                turnTimeLimit: GAME_SETTINGS.DEFAULT_TURN_TIME,
            },
            story: [],
            players: null,
        };


        await set(gameRef, initialGameState);
        return gameId;
    },

    // Check if game exists
    async checkGameExists(gameId: string): Promise<boolean> {
        const snapshot = await get(child(ref(db), `games/${gameId}`));
        return snapshot.exists();
    },

    // Subscribe to game state changes
    subscribeToGame(gameId: string, callback: (data: GameState | null) => void) {
        const gameRef = ref(db, `games/${gameId}`);
        const unsubscribe = onValue(gameRef, (snapshot) => {
            const data = snapshot.val();
            callback(data);
        });
        return () => off(gameRef, "value", unsubscribe); // Return cleanup function
    },

    // Create or update a player (with transaction for safety)
    async joinGame(gameId: string, playerName: string, playerId?: string): Promise<{ playerId: string; color: string }> {
        const { GAME_RULES, PLAYER_COLORS } = await import("@/lib/constants");
        const newPlayerId = playerId || `player_${uuidv4()}`;
        const playersRef = ref(db, `games/${gameId}/players`);

        let assignedColor: string = PLAYER_COLORS[0];

        // transaction to ensure we don't exceed max players or duplicate colors race
        // Note: This transaction is on the entire 'players' node. 
        // For 20 players this is fine. For 1000 it would be bad.
        try {
            await import("firebase/database").then(({ runTransaction }) => {
                return runTransaction(playersRef, (currentPlayers) => {
                    if (currentPlayers === null) {
                        // First player
                        const p: Player = {
                            id: newPlayerId,
                            name: playerName.substring(0, GAME_RULES.MAX_NAME_LENGTH),
                            color: PLAYER_COLORS[0],
                            isActive: true,
                            lastSeen: Date.now()
                        };
                        assignedColor = p.color;
                        return { [newPlayerId]: p };
                    }

                    // Re-joining player logic should ideally handle outside, but let's see
                    if (currentPlayers[newPlayerId]) {
                        // Already exists, just update active status and name
                        // We return the existing color
                        assignedColor = currentPlayers[newPlayerId].color;
                        currentPlayers[newPlayerId].isActive = true;
                        currentPlayers[newPlayerId].lastSeen = Date.now();
                        currentPlayers[newPlayerId].name = playerName.substring(0, GAME_RULES.MAX_NAME_LENGTH);
                        return currentPlayers;
                    }

                    // New Player
                    const count = Object.keys(currentPlayers).length;
                    if (count >= GAME_RULES.MAX_PLAYERS) {
                        console.error("Game full");
                        return; // Abort transaction
                    }

                    const colorIndex = count % PLAYER_COLORS.length;
                    assignedColor = PLAYER_COLORS[colorIndex];

                    currentPlayers[newPlayerId] = {
                        id: newPlayerId,
                        name: playerName.substring(0, GAME_RULES.MAX_NAME_LENGTH),
                        color: assignedColor,
                        isActive: true,
                        lastSeen: Date.now()
                    };

                    return currentPlayers;
                });
            });
        } catch (e) {
            console.error("Transaction failed", e);
            throw e;
        }

        return { playerId: newPlayerId, color: assignedColor };
    },

    async startGame(gameId: string) {
        // Trigger the first turn!
        // We need to fetch current players first
        const playersRef = ref(db, `games/${gameId}/players`);
        const snapshot = await get(playersRef);
        const players = snapshot.val() || {};
        const playerIds = Object.keys(players).filter(key => players[key].isActive);

        if (playerIds.length < 2) { // Should be GAME_RULES.MIN_PLAYERS
            console.error("Not enough players");
            return;
        }

        // Initial shuffle
        const shuffled = playerIds.sort(() => Math.random() - 0.5);
        const firstPlayer = shuffled[0];
        const remainingBag = shuffled.slice(1);

        const updates: any = {
            status: "PLAYING",
            currentPlayerId: firstPlayer,
            turnBag: remainingBag,
            lastPlayerId: null, // First turn has no previous player
            timer: 30, // Default turn time (should come from settings)
            timerStartedAt: Date.now()
        };

        const gameRef = ref(db, `games/${gameId}`);
        await update(gameRef, updates);
    },

    async nextTurn(gameId: string) {
        const gameRef = ref(db, `games/${gameId}`);
        const { GAME_SETTINGS } = await import("@/lib/constants");

        await import("firebase/database").then(({ runTransaction }) => {
            runTransaction(gameRef, (game) => {
                if (!game) return null;

                // Logic to pick next player
                const players = game.players || {};
                const activeIds = Object.keys(players).filter(id => players[id].isActive);

                if (activeIds.length < 2) {
                    game.status = "PAUSED";
                    game.currentPlayerId = null;
                    return game;
                }

                let nextBag = game.turnBag || [];

                // If bag is empty or invalid, refill
                if (!Array.isArray(nextBag) || nextBag.length === 0) {
                    // Refill with all active players
                    nextBag = activeIds.sort(() => Math.random() - 0.5);

                    // Continuity check: Don't let same player go twice if possible
                    if (game.currentPlayerId && nextBag[0] === game.currentPlayerId && nextBag.length > 1) {
                        // Swap first and second
                        [nextBag[0], nextBag[1]] = [nextBag[1], nextBag[0]];
                    }
                }

                // Filter out any players in the bag who might have disconnected since shuffle
                nextBag = nextBag.filter((id: string) => players[id]?.isActive);

                // If filtering emptied it again, just recurse-ish (or fail safe)
                if (nextBag.length === 0) {
                    // Emergency refill
                    nextBag = activeIds.sort(() => Math.random() - 0.5);
                }

                const nextPlayerId = nextBag.shift();

                game.currentPlayerId = nextPlayerId;
                game.turnBag = nextBag;
                game.lastPlayerId = game.currentPlayerId;
                game.timerStartedAt = Date.now();

                // Reset timer duration (could be dynamic in future)
                game.timer = game.settings?.turnTimeLimit || 30;

                return game;
            });
        });
    },

    const { v4: uuidv4 } = await import("uuid");

    // 1. Add story segment
    // We use runTransaction on the story array to safely append
    const storyRef = ref(db, `games/${gameId}/story`);
    // Snapshot to get current player color
    const playerRef = ref(db, `games/${gameId}/players/${playerId}`);
    const playerSnap = await get(playerRef);
    const playerColor = playerSnap.exists() ? playerSnap.val().color : "#000000";

    await import("firebase/database").then(({ runTransaction }) => {
        runTransaction(storyRef, (story: any[]) => { // basic typing for internal block
            if (!story) story = [];

            // Capitalization Logic
            let finalText = text.trim();
            if (finalText.length > 0) {
                const lastSegment = story.length > 0 ? story[story.length - 1] : null;
                const lastChar = lastSegment ? lastSegment.text.trim().slice(-1) : null;

                // Capitalize if: Start of story OR Previous ended with . ? ! : OR Previous was empty (edge case)
                const shouldCapitalize = !lastSegment || ['.', '!', '?', ':'].includes(lastChar);

                if (shouldCapitalize) {
                    finalText = finalText.charAt(0).toUpperCase() + finalText.slice(1);
                } else {
                    // Force lowercase to override mobile keyboard auto-capitalization
                    finalText = finalText.charAt(0).toLowerCase() + finalText.slice(1);
                }
            }

            story.push({
                id: uuidv4(),
                text: finalText,
                authorId: playerId,
                color: playerColor,
                timestamp: Date.now()
            });

            return story;
        });
    });

    // 2. Advance turn
    await this.nextTurn(gameId);
},

    async leaveGame(gameId: string, playerId: string) {
        const playerRef = ref(db, `games/${gameId}/players/${playerId}`);
        await update(playerRef, { isActive: false });
        // TODO: functionality to auto-pause if falling below min players will be in nextTurn or separate listener
    }
};
