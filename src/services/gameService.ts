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
        // Logic for moving to next player
        // This will be implemented fully in next step, needing `runTransaction` or careful reading
    },

    async leaveGame(gameId: string, playerId: string) {
        const playerRef = ref(db, `games/${gameId}/players/${playerId}`);
        await update(playerRef, { isActive: false });
        // TODO: functionality to auto-pause if falling below min players will be in nextTurn or separate listener
    }
};
