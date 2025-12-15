"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { gameService } from "@/services/gameService";
import { GameState, Player } from "@/types";
import { ref, get, child } from "firebase/database";
import { db } from "@/lib/firebase";

// We need to wrap the logic in a component that uses useSearchParams inside Suspense
function PlayerLogic() {
    const params = useParams();
    const gameId = params.gameId as string;
    const searchParams = useSearchParams();
    const router = useRouter();

    const playerIdParam = searchParams.get('p');

    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<"NAME_ENTRY" | "WAITING" | "PLAYING">("NAME_ENTRY");
    const [playerName, setPlayerName] = useState("");
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [playerData, setPlayerData] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 1. Handle ID Generation / URL Sync
    useEffect(() => {
        if (!playerIdParam) {
            // No ID? Generate one and redirect
            const newId = `player_${uuidv4()}`;
            router.replace(`/play/${gameId}?p=${newId}`);
        } else {
            setPlayerId(playerIdParam);
        }
    }, [playerIdParam, gameId, router]);

    // 2. Once we have an ID, check if player exists
    useEffect(() => {
        if (!playerId || !gameId) return;

        // Check if player already registered
        const checkPlayer = async () => {
            try {
                const pRef = ref(db, `games/${gameId}/players/${playerId}`);
                const snapshot = await get(pRef);

                if (snapshot.exists()) {
                    const pData = snapshot.val();
                    setPlayerData(pData);
                    setView("WAITING"); // Or whatever state the game is in
                } else {
                    // New player -> Show Name Entry
                    setView("NAME_ENTRY");
                }
                setLoading(false);
            } catch (err) {
                console.error(err);
                setError("Connection error");
                setLoading(false);
            }
        };

        checkPlayer();
    }, [playerId, gameId]);

    // 3. Subscribe to Game State
    useEffect(() => {
        if (!gameId) return;
        const unsubscribe = gameService.subscribeToGame(gameId, (data) => {
            setGameState(data);
            // Auto-switch to PLAYING view if game started and we are waiting
            if (data && data.status === "PLAYING" && view === "WAITING") {
                setView("PLAYING");
            }
            // If game ends, maybe switch to ENDED? (Will handle later)
        });
        return () => unsubscribe();
    }, [gameId, view]); // view dep ensures we only switch if currently waiting


    const handleSubmitName = async () => {
        if (!playerName.trim() || !gameId || !playerId) return;

        setLoading(true);
        try {
            const { color } = await gameService.joinGame(gameId, playerName, playerId);
            // Optimistic update
            setPlayerData({
                id: playerId,
                name: playerName,
                color: color,
                isActive: true,
                lastSeen: Date.now()
            });
            setView("WAITING");
        } catch (err) {
            console.error(err);
            setError("Failed to join.");
        } finally {
            setLoading(false);
        }
    };

    const handleLeaveGame = async () => {
        if (confirm("Are you sure you want to leave this story? You can rejoin properly later.")) {
            if (gameId && playerId) {
                await gameService.leaveGame(gameId, playerId);
            }
            router.push('/');
        }
    };

    if (!playerIdParam) return null; // Wait for redirect
    if (loading) return <div className="p-8 text-center text-white bg-black h-screen flex items-center justify-center">Loading...</div>;
    if (error) return <div className="p-8 text-center text-red-500 bg-black h-screen flex items-center justify-center">{error}</div>;

    // --- VIEWS ---

    if (view === "NAME_ENTRY") {
        return (
            <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col justify-center max-w-md mx-auto">
                <h1 className="text-2xl font-bold mb-8 text-center">Join Story</h1>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-zinc-400 mb-1">Your Name</label>
                        <input
                            type="text"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSubmitName()}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Enter name..."
                            maxLength={12}
                        />
                        <div className="text-right text-xs text-zinc-500 mt-1">
                            {playerName.length}/12
                        </div>
                    </div>

                    <button
                        onClick={handleSubmitName}
                        disabled={!playerName.trim()}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-lg text-lg transition-all"
                    >
                        Join Game
                    </button>
                </div>
            </div>
        );
    }

    // WAITING / PLAYING VIEW
    const isMyTurn = gameState?.currentPlayerId === playerId;
    const isPaused = gameState?.status === "PAUSED";
    const isEnded = gameState?.status === "ENDED";

    // If we are "PLAYING" but game is paused or ended, show that
    if (isPaused) {
        return (
            <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col items-center justify-center text-center">
                <h2 className="text-2xl font-bold mb-2 text-amber-500">GAME PAUSED</h2>
                <p className="text-zinc-400">Waiting for players...</p>
            </div>
        );
    }

    // If it's my turn
    if (view === "PLAYING" && isMyTurn) {
        return (
            <div className="min-h-screen bg-indigo-950 text-white p-6 flex flex-col items-center justify-center">
                <div className="animate-bounce mb-8">
                    <span className="text-4xl">🫵</span>
                </div>
                <h1 className="text-4xl font-bold mb-4">YOUR TURN!</h1>
                <p className="text-indigo-200 mb-8">Look at the host screen!</p>

                {/* Input Input Component will go here Phase 3 */}
                <div className="w-full max-w-sm">
                    <input type="text" placeholder="Type a word..." className="w-full p-4 text-black rounded-lg" />
                    <button className="w-full bg-white text-indigo-900 font-bold py-4 mt-4 rounded-lg">SUBMIT</button>
                </div>
            </div>
        );
    }

    // Default Waiting Screen (not my turn, or lobby)
    return (
        <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col items-center justify-center">
            <div className="w-full max-w-sm bg-zinc-800 p-6 rounded-2xl border border-zinc-700 text-center">
                <div
                    className="w-16 h-16 rounded-full mx-auto mb-4 border-4 border-zinc-900 shadow-xl"
                    style={{ backgroundColor: playerData?.color }}
                />
                <h2 className="text-2xl font-bold mb-2">{playerData?.name}</h2>

                {gameState?.status === "PLAYING" ? (
                    <div className="mt-4">
                        <p className="text-zinc-400 animate-pulse">Waiting for turn...</p>
                        {gameState.currentPlayerId && (
                            <p className="text-xs text-zinc-500 mt-2">
                                Current turn: {gameState.players?.[gameState.currentPlayerId]?.name || "Unknown"}
                            </p>
                        )}
                    </div>
                ) : (
                    <p className="text-zinc-400">Waiting for host to start...</p>
                )}
            </div>

            <button
                onClick={handleLeaveGame}
                className="mt-8 text-zinc-500 text-sm hover:text-white underline decoration-zinc-700"
            >
                Leave Game
            </button>
        </div>
    );
}

export default function PlayerPage() {
    return (
        <Suspense fallback={<div className="text-white p-8">Loading...</div>}>
            <PlayerLogic />
        </Suspense>
    );
}
