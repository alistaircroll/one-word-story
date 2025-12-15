"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { gameService } from "@/services/gameService";
import { GameState, GameStatus } from "@/types";
import { GAME_RULES } from "@/lib/constants";

export default function HostGamePage() {
    const params = useParams();
    const gameId = params.gameId as string;
    const router = useRouter();

    const [gameState, setGameState] = useState<GameState | null>(null);
    const [loading, setLoading] = useState(true);

    // Initial subscription
    useEffect(() => {
        if (!gameId) return;

        const unsubscribe = gameService.subscribeToGame(gameId, (data) => {
            setGameState(data);
            setLoading(false);

            // If data is null, game doesn't exist
            if (data === null) {
                // Redirect to home or show error?
                // Ideally we check existence first, but this works
            }
        });

        return () => unsubscribe();
    }, [gameId]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-900 text-white">
                <div className="animate-pulse">Loading game...</div>
            </div>
        );
    }

    if (!gameState) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-900 text-white flex-col gap-4">
                <h1 className="text-2xl">Game Not Found</h1>
                <p>Return to home to create a new game.</p>
                <button
                    onClick={() => router.push('/')}
                    className="bg-zinc-700 px-4 py-2 rounded"
                >
                    Home
                </button>
            </div>
        );
    }

    // --- RENDERERS ---

    if (gameState.status === "LOBBY") {
        return <LobbyView gameId={gameId} gameState={gameState} />;
    }

    return <GameView gameId={gameId} gameState={gameState} />;
}

// --- SUB-COMPONENTS ---

function LobbyView({ gameId, gameState }: { gameId: string, gameState: GameState }) {
    const players = Object.values(gameState.players || {});
    const activePlayers = players.filter(p => p.isActive);
    const playerCount = activePlayers.length;
    const canStart = playerCount >= GAME_RULES.MIN_PLAYERS;

    // We need the full URL for the QR code
    // In dev: http://localhost:3000/join/GAMEID
    // We can use window.location.origin
    const [origin, setOrigin] = useState("");
    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);

    const joinUrl = `${origin}/join/${gameId}`;

    return (
        <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col">
            {/* Header */}
            <header className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
                <h1 className="text-2xl font-bold tracking-tight">ONE WORD STORY</h1>
                <div className="text-zinc-400">Status: <span className="text-white font-mono">LOBBY</span></div>
            </header>

            {/* Main Content */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-12">

                {/* Left Col: Join Info */}
                <div className="flex flex-col items-center justify-center p-8 bg-zinc-800/50 rounded-2xl border border-zinc-700/50">
                    <div className="bg-white p-4 rounded-xl mb-6">
                        {origin && <QRCodeSVG value={joinUrl} size={256} />}
                    </div>
                    <div className="text-center">
                        <p className="text-zinc-400 uppercase tracking-widest text-sm mb-2">Join at</p>
                        <div className="text-3xl font-bold font-mono bg-zinc-950 px-6 py-3 rounded-lg border border-zinc-700 mb-4">
                            {joinUrl.replace(/^https?:\/\//, '')}
                        </div>

                        <p className="text-zinc-400 uppercase tracking-widest text-sm mb-2">Room Code</p>
                        <div className="text-6xl font-bold font-mono tracking-widest text-indigo-400">
                            {gameId}
                        </div>
                    </div>
                </div>

                {/* Right Col: Players & Controls */}
                <div className="flex flex-col">
                    <div className="flex justify-between items-end mb-4">
                        <h2 className="text-xl font-bold">Players</h2>
                        <div className="text-zinc-400">
                            {playerCount} / {GAME_RULES.MAX_PLAYERS}
                        </div>
                    </div>

                    <div className="flex-1 bg-zinc-800/30 rounded-xl p-4 mb-6 border border-zinc-700/50 min-h-[300px]">
                        {playerCount === 0 ? (
                            <div className="h-full flex items-center justify-center text-zinc-500 italic">
                                Waiting for players to join...
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {activePlayers.map(player => (
                                    <div key={player.id} className="flex items-center gap-3 bg-zinc-800 p-3 rounded-lg border border-zinc-700">
                                        <div
                                            className="w-4 h-4 rounded-full"
                                            style={{ backgroundColor: player.color }}
                                        />
                                        <span className="font-bold truncate">{player.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex gap-4">
                        {/* Settings placeholders */}
                        <button className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-lg font-bold border border-zinc-700">
                            Settings ⚙
                        </button>

                        <button
                            onClick={() => gameService.startGame(gameId)}
                            className={`flex-[2] py-4 rounded-lg font-bold text-lg shadow-lg transition-all ${canStart
                                ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20"
                                : "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                                }`}
                            disabled={!canStart}
                        >
                            Start Game
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}

function GameView({ gameId, gameState }: { gameId: string, gameState: GameState }) {
    // Placeholder for Phase 3
    return (
        <div className="min-h-screen bg-zinc-900 text-white p-8">
            <h1 className="text-4xl text-center mt-20">Game in Progress</h1>
            <p className="text-center text-zinc-400 mt-4">Development in progress...</p>
        </div>
    );
}
