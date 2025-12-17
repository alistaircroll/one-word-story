"use client";

import React, { useEffect, useState } from "react";
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

    // Auto-Pause Monitor
    useEffect(() => {
        if (!gameState || gameState.status !== "PLAYING") return;

        const players = gameState.players || {};
        const activeCount = Object.values(players).filter(p => p.isActive).length;

        if (activeCount < GAME_RULES.MIN_PLAYERS) {
            // We (the host) trigger the pause
            gameService.pauseGame(gameId);
        }
    }, [gameState, gameId]);

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

// Helper hook for timer (could share but keeping adjacent for now)
function useGameTimer(gameState: GameState) {
    const [timeLeft, setTimeLeft] = useState(0);
    useEffect(() => {
        if (gameState?.status === "PLAYING" && gameState.timerStartedAt) {
            const tick = () => {
                const elapsed = (Date.now() - (gameState.timerStartedAt || 0)) / 1000;
                const remaining = Math.max(0, (gameState.settings?.turnTimeLimit || 30) - elapsed);
                setTimeLeft(remaining);
            };
            tick(); // initial
            const interval = setInterval(tick, 500);
            return () => clearInterval(interval);
        } else {
            setTimeLeft(0);
        }
    }, [gameState]);
    return timeLeft;
}

function GameView({ gameId, gameState }: { gameId: string, gameState: GameState }) {
    const players = gameState.players || {};
    const currentPlayer = gameState.currentPlayerId ? players[gameState.currentPlayerId] : null;
    const story = gameState.story || [];
    const timeLeft = useGameTimer(gameState);

    // QR Code URL
    const [origin, setOrigin] = useState("");
    useEffect(() => {
        setOrigin(window.location.origin);
    }, []);
    const joinUrl = `${origin}/join/${gameId}`;

    // Auto-scroll story
    const storyEndRef = React.useRef<HTMLSpanElement>(null);
    useEffect(() => {
        storyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [story.length]);

    return (
        <div className="min-h-screen bg-zinc-900 text-white flex flex-col">
            {/* Top Bar */}
            <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-bold tracking-tight text-zinc-400">ONE WORD STORY</h1>
                    <div className="bg-zinc-800 px-3 py-1 rounded text-sm font-mono border border-zinc-700">
                        {gameId}
                    </div>
                </div>

                {/* Active Player Status */}
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="text-xs text-zinc-500 uppercase tracking-widest">Current Turn</div>
                        {currentPlayer ? (
                            <div className="text-xl font-bold flex items-center justify-end gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ background: currentPlayer.color }}></span>
                                {currentPlayer.name}
                            </div>
                        ) : (
                            <div className="text-xl font-bold text-zinc-500">PAUSED</div>
                        )}
                    </div>

                    {/* Timer */}
                    <div className={`w-16 h-16 rounded-full flex items-center justify-center border-4 text-xl font-bold font-mono ${timeLeft < 10 ? 'bg-red-900 border-red-700 animate-pulse' : 'bg-zinc-800 border-zinc-700'}`}>
                        {Math.ceil(timeLeft)}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex">
                {/* Story Area */}
                <div className="flex-1 p-8 sm:p-16 max-w-5xl mx-auto w-full overflow-auto">
                    <div className="text-4xl sm:text-5xl leading-relaxed font-serif text-zinc-300">
                        {story.length === 0 ? (
                            <span className="text-zinc-700 italic">Once upon a time...</span>
                        ) : (
                            story.map((segment) => (
                                <span
                                    key={segment.id}
                                    style={{ color: segment.color }}
                                    className="hover:bg-zinc-800/50 rounded transition-colors cursor-pointer"
                                    title={`By ${players[segment.authorId]?.name || "Unknown"}`}
                                >
                                    {segment.text}{" "}
                                </span>
                            ))
                        )}

                        {/* Cursor for current player */}
                        {currentPlayer && (
                            <span className="inline-block w-1 h-10 ml-1 translate-y-2 animate-pulse" style={{ backgroundColor: currentPlayer.color }} />
                        )}
                        <span ref={storyEndRef} />
                    </div>
                </div>

                {/* QR Sidebar */}
                <div className="hidden lg:flex flex-col items-center justify-center p-6 bg-zinc-800/30 border-l border-zinc-800 w-64">
                    <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Join Game</p>
                    {origin && (
                        <div className="bg-white p-2 rounded-lg">
                            <QRCodeSVG value={joinUrl} size={120} />
                        </div>
                    )}
                    <p className="text-indigo-400 font-mono font-bold text-2xl mt-3">{gameId}</p>
                </div>
            </div>

            {/* Host Controls */}
            <div className="p-6 border-t border-zinc-800 bg-zinc-900 flex justify-center gap-4">
                {gameState.status === "PAUSED" ? (
                    <>
                        {Object.values(players).filter(p => p.isActive).length >= 2 ? (
                            <button
                                onClick={() => gameService.resumeGame(gameId)}
                                className="bg-green-600 hover:bg-green-500 text-white px-8 py-4 rounded-lg font-bold text-lg shadow-lg transition-all"
                            >
                                ▶ Resume Game
                            </button>
                        ) : (
                            <div className="text-amber-500 font-bold">
                                Waiting for more players to resume...
                            </div>
                        )}
                    </>
                ) : (
                    <button
                        onClick={() => gameService.nextTurn(gameId)}
                        className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-3 rounded-lg font-bold border border-zinc-700 transition-colors"
                    >
                        Skip Player
                    </button>
                )}
            </div>
        </div>
    );
}
