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

        try {
            await import("firebase/database").then(({ runTransaction }) => {
                return runTransaction(playersRef, (currentPlayers) => {
                    const now = Date.now();

                    if (currentPlayers === null) {
                        // First player
                        const p: Player = {
                            id: newPlayerId,
                            name: playerName.substring(0, GAME_RULES.MAX_NAME_LENGTH),
                            color: PLAYER_COLORS[0],
                            isActive: true,
                            lastSeen: now,
                            totalResponseTime: 0,
                            turnCount: 0,
                            lastTurnTime: null
                        };
                        assignedColor = p.color;
                        return { [newPlayerId]: p };
                    }

                    if (currentPlayers[newPlayerId]) {
                        // Re-joining
                        assignedColor = currentPlayers[newPlayerId].color;
                        currentPlayers[newPlayerId].isActive = true;
                        currentPlayers[newPlayerId].lastSeen = now;
                        currentPlayers[newPlayerId].name = playerName.substring(0, GAME_RULES.MAX_NAME_LENGTH);
                        return currentPlayers;
                    }

                    // New Player
                    const count = Object.keys(currentPlayers).length;
                    if (count >= GAME_RULES.MAX_PLAYERS) return; // Abort

                    const colorIndex = count % PLAYER_COLORS.length;
                    assignedColor = PLAYER_COLORS[colorIndex];

                    // Late-joiner Fairness
                    // Start with max(totalResponseTime) of active players
                    const activePlayers = Object.values(currentPlayers).filter((p: any) => p.isActive) as Player[];
                    const maxTime = activePlayers.length > 0
                        ? Math.max(...activePlayers.map(p => p.totalResponseTime || 0))
                        : 0;

                    currentPlayers[newPlayerId] = {
                        id: newPlayerId,
                        name: playerName.substring(0, GAME_RULES.MAX_NAME_LENGTH),
                        color: assignedColor,
                        isActive: true,
                        lastSeen: now,
                        totalResponseTime: maxTime,
                        turnCount: 0,
                        lastTurnTime: null
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

    // Add late-joiner to turn bag if game is playing
    async addToTurnBag(gameId: string, playerId: string) {
        const gameRef = ref(db, `games/${gameId}`);

        await import("firebase/database").then(({ runTransaction }) => {
            runTransaction(gameRef, (game) => {
                if (!game) return null;

                if (game.status === "PLAYING") {
                    const bag = game.turnBag || [];
                    if (!bag.includes(playerId) && game.currentPlayerId !== playerId) {
                        const insertPos = Math.floor(Math.random() * (bag.length + 1));
                        bag.splice(insertPos, 0, playerId);
                        game.turnBag = bag;
                    }
                }

                return game;
            });
        });
    },

    async startGame(gameId: string) {
        const playersRef = ref(db, `games/${gameId}/players`);
        const snapshot = await get(playersRef);
        const players = snapshot.val() || {};
        const playerIds = Object.keys(players).filter(key => players[key].isActive);

        if (playerIds.length < 2) return;

        const shuffled = playerIds.sort(() => Math.random() - 0.5);
        const firstPlayer = shuffled[0];
        const remainingBag = shuffled.slice(1);

        const updates: any = {
            status: "PLAYING",
            currentPlayerId: firstPlayer,
            turnBag: remainingBag,
            lastPlayerId: null,
            timer: 30,
            timerStartedAt: Date.now()
        };

        const gameRef = ref(db, `games/${gameId}`);
        await update(gameRef, updates);
    },

    async resumeGame(gameId: string) {
        const gameRef = ref(db, `games/${gameId}`);
        const snapshot = await get(gameRef);
        const game = snapshot.val();

        if (!game) return;

        const players = game.players || {};
        const activeIds = Object.keys(players).filter(id => players[id].isActive);

        if (activeIds.length < 2) return;

        const shuffled = activeIds.sort(() => Math.random() - 0.5);

        const updates: any = {
            status: "PLAYING",
            currentPlayerId: shuffled[0],
            turnBag: shuffled.slice(1),
            timerStartedAt: Date.now(),
            timer: game.settings?.turnTimeLimit || 30
        };

        await update(gameRef, updates);
    },


    // Updated signature for internal use or direct use
    async forceNextTurn(gameId: string, penalize: boolean = false) {
        const gameRef = ref(db, `games/${gameId}`);
        await import("firebase/database").then(({ runTransaction }) => {
            runTransaction(gameRef, (game) => {
                if (!game) return null;

                const players = game.players || {};
                const activeIds = Object.keys(players).filter(id => players[id].isActive);

                // Penalty Logic
                if (penalize && game.currentPlayerId && players[game.currentPlayerId]) {
                    const p = players[game.currentPlayerId];
                    const penaltyTime = (game.settings?.turnTimeLimit || 30) * 1000;
                    p.totalResponseTime = (p.totalResponseTime || 0) + penaltyTime;
                    p.turnCount = (p.turnCount || 0) + 1;
                    p.lastTurnTime = penaltyTime;
                }

                if (activeIds.length < 2) {
                    game.status = "PAUSED";
                    game.currentPlayerId = null;
                    return game;
                }

                let nextBag = game.turnBag || [];
                if (!Array.isArray(nextBag) || nextBag.length === 0) {
                    nextBag = activeIds.sort(() => Math.random() - 0.5);
                    if (game.currentPlayerId && nextBag[0] === game.currentPlayerId && nextBag.length > 1) {
                        [nextBag[0], nextBag[1]] = [nextBag[1], nextBag[0]];
                    }
                }
                nextBag = nextBag.filter((id: string) => players[id]?.isActive);
                if (nextBag.length === 0) nextBag = activeIds.sort(() => Math.random() - 0.5);

                const nextPlayerId = nextBag.shift();
                game.currentPlayerId = nextPlayerId;
                game.turnBag = nextBag;
                game.lastPlayerId = game.currentPlayerId;
                game.timerStartedAt = Date.now();
                game.timer = game.settings?.turnTimeLimit || 30;

                return game;
            });
        });
    },

    // Alias for old calls (no penalty by default? Or should skip be penalty?)
    // "On timeout/skip: Use full turnTimeLimit"
    // So manual skip (button) IS a penalty.
    async nextTurn(gameId: string) {
        return this.forceNextTurn(gameId, true);
    },

    async submitWords(gameId: string, playerId: string, text: string) {
        const { v4: uuidv4 } = await import("uuid");

        // 1. Calculate Response Time
        // We need to fetch game state first to get timerStartedAt
        // Can we do this inside the transaction? Yes.

        const gameRef = ref(db, `games/${gameId}`);

        await import("firebase/database").then(({ runTransaction }) => {
            runTransaction(gameRef, (game) => {
                if (!game) return null;

                // --- STATS UPDATE ---
                const now = Date.now();
                const start = game.timerStartedAt || now;
                const responseTime = now - start;

                if (game.players && game.players[playerId]) {
                    const p = game.players[playerId];
                    p.totalResponseTime = (p.totalResponseTime || 0) + responseTime;
                    p.turnCount = (p.turnCount || 0) + 1;
                    p.lastTurnTime = responseTime;
                }

                // --- STORY UPDATE ---
                if (!game.story) game.story = [];
                const story = game.story;

                // Capitalization Logic
                let finalText = text.trim();
                // ... (simplified cap logic reuse) ...
                if (finalText.length > 0) {
                    const lastSegment = story.length > 0 ? story[story.length - 1] : null;
                    const lastChar = lastSegment ? lastSegment.text.trim().slice(-1) : null;
                    const shouldCapitalize = !lastSegment || ['.', '!', '?', ':'].includes(lastChar);
                    if (shouldCapitalize) finalText = finalText.charAt(0).toUpperCase() + finalText.slice(1);
                    else finalText = finalText.charAt(0).toLowerCase() + finalText.slice(1);
                }

                story.push({
                    id: uuidv4(),
                    text: finalText,
                    authorId: playerId,
                    color: game.players[playerId]?.color || "#000",
                    timestamp: now,
                    metadata: {
                        responseTime: responseTime
                    }
                });

                // --- NEXT TURN LOGIC (INLINED OR CALLED?) ---
                // Cannot call async 'this.forceNextTurn' inside transaction.
                // Must do logic here.

                // Duplicate nextTurn logic here? 
                // Alternatively, submitWords updates story/stats, then calls nextTurn separately?
                // But nextTurn needs to know NOT to penalize.
                // If I separate them, there's a race condition where stats update but turn doesn't?
                // Ideally do it all in one transaction.

                const players = game.players || {};
                const activeIds = Object.keys(players).filter(id => players[id].isActive);

                if (activeIds.length < 2) {
                    game.status = "PAUSED";
                    game.currentPlayerId = null;
                    return game;
                }

                let nextBag = game.turnBag || [];
                if (!Array.isArray(nextBag) || nextBag.length === 0) {
                    nextBag = activeIds.sort(() => Math.random() - 0.5);
                    if (game.currentPlayerId && nextBag[0] === game.currentPlayerId && nextBag.length > 1) {
                        [nextBag[0], nextBag[1]] = [nextBag[1], nextBag[0]];
                    }
                }
                nextBag = nextBag.filter((id: string) => players[id]?.isActive);
                if (nextBag.length === 0) nextBag = activeIds.sort(() => Math.random() - 0.5);

                game.currentPlayerId = nextBag.shift();
                game.turnBag = nextBag;
                game.lastPlayerId = game.currentPlayerId;
                game.timerStartedAt = Date.now();
                game.timer = game.settings?.turnTimeLimit || 30;

                return game;
            });
        });
    },

    async leaveGame(gameId: string, playerId: string) {
        const playerRef = ref(db, `games/${gameId}/players/${playerId}`);
        await update(playerRef, { isActive: false });
    },

    // Presence & Heartbeat
    async setupPresence(gameId: string, playerId: string) {
        const { onDisconnect } = await import("firebase/database");

        const playerRef = ref(db, `games/${gameId}/players/${playerId}`);
        const connectedRef = ref(db, ".info/connected");

        // When I disconnect, set isActive to false
        onDisconnect(playerRef).update({
            isActive: false,
            lastSeen: Date.now()
        });

        // Optional: Manage connection state locally if needed
        // but the server-side onDisconnect is the key safety net.
    },

    async heartbeat(gameId: string, playerId: string) {
        const playerRef = ref(db, `games/${gameId}/players/${playerId}`);
        await update(playerRef, { lastSeen: Date.now(), isActive: true });
    },

    async pauseGame(gameId: string) {
        const gameRef = ref(db, `games/${gameId}`);
        await update(gameRef, { status: "PAUSED" });
    },

    async endGame(gameId: string) {
        const gameRef = ref(db, `games/${gameId}`);
        await update(gameRef, { status: "ENDED", currentPlayerId: null });
    },

    async updateStorySegment(gameId: string, segmentId: string, newText: string) {
        const gameRef = ref(db, `games/${gameId}`);
        await import("firebase/database").then(({ runTransaction }) => {
            runTransaction(gameRef, (game) => {
                if (!game || !game.story) return game;

                const segmentIndex = game.story.findIndex((s: any) => s.id === segmentId);
                if (segmentIndex !== -1) {
                    game.story[segmentIndex].text = newText;
                }
                return game;
            });
        });
    },

    async deleteStorySegment(gameId: string, segmentId: string) {
        const gameRef = ref(db, `games/${gameId}`);
        await import("firebase/database").then(({ runTransaction }) => {
            runTransaction(gameRef, (game) => {
                if (!game || !game.story) return game;

                // Filter out the deleted segment
                game.story = game.story.filter((s: any) => s.id !== segmentId);
                return game;
            });
        });
    },

    async updateSettings(gameId: string, settings: any) {
        const gameRef = ref(db, `games/${gameId}/settings`);
        await update(gameRef, settings);
    },

    async clearPlayers(gameId: string) {
        const playersRef = ref(db, `games/${gameId}/players`);
        await set(playersRef, null);
    }
};
