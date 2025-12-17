"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { gameService } from "@/services/gameService";
import { GameState, GameStatus } from "@/types";
import { GAME_RULES, LEADERBOARD } from "@/lib/constants";

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

    // Settings State
    const [showSettings, setShowSettings] = useState(false);

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
                        {/* Settings Button */}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-4 rounded-lg font-bold border border-zinc-700"
                        >
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

            <SettingsModal
                gameId={gameId}
                settings={gameState.settings}
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />
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

    const handleCopyStory = async () => {
        const fullStory = story.map(s => s.text).join(' ');
        try {
            await navigator.clipboard.writeText(fullStory);
            alert("Story copied to clipboard!");
        } catch (e) {
            console.error("Copy failed", e);
        }
    };

    // Editing State
    const [showSettings, setShowSettings] = useState(false);
    const [editingSegment, setEditingSegment] = useState<{ id: string, text: string } | null>(null);

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
                            <div className="text-xl font-bold text-zinc-500">
                                {gameState.status === "ENDED" ? "THE END" : "PAUSED"}
                            </div>
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
                                    className="hover:bg-zinc-800/50 rounded transition-colors cursor-pointer border-b-2 border-transparent hover:border-zinc-700"
                                    title={`By ${players[segment.authorId]?.name || "Unknown"} (Click to edit)`}
                                    onClick={() => setEditingSegment({ id: segment.id, text: segment.text })}
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

                {/* Leaderboard Sidebar */}
                <div className={`hidden lg:flex flex-col p-6 bg-zinc-900 border-l border-zinc-800 w-80 shadow-xl z-20 ${gameState.status === 'LOBBY' ? 'hidden' : ''}`}>
                    <div className="mb-6 flex-1 overflow-hidden flex flex-col">
                        <Leaderboard players={players || {}} currentPlayerId={gameState.currentPlayerId} />
                    </div>

                    {/* QR Mini Code */}
                    <div className="border-t border-zinc-800 pt-4 flex flex-col items-center bg-zinc-900/50">
                        <p className="text-zinc-600 text-[10px] uppercase tracking-widest mb-2">Join Code: <span className="text-indigo-400 font-bold text-sm">{gameId}</span></p>
                        {origin && (
                            <div className="bg-white p-1 rounded">
                                <QRCodeSVG value={joinUrl} size={80} />
                            </div>
                        )}
                    </div>
                </div>

                {/* QR Sidebar (Only for LOBBY) */}
                {gameState.status === "LOBBY" && (
                    <div className="hidden lg:flex flex-col items-center justify-center p-6 bg-zinc-800/30 border-l border-zinc-800 w-80">
                        <p className="text-zinc-500 text-xs uppercase tracking-widest mb-2">Join Game</p>
                        {origin && (
                            <div className="bg-white p-2 rounded-lg">
                                <QRCodeSVG value={joinUrl} size={120} />
                            </div>
                        )}
                        <p className="text-indigo-400 font-mono font-bold text-2xl mt-3">{gameId}</p>
                    </div>
                )}
            </div>

            {/* Host Controls */}
            <div className="p-6 border-t border-zinc-800 bg-zinc-900 flex justify-center gap-4">
                <button
                    onClick={() => setShowSettings(true)}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-3 rounded-lg font-bold border border-zinc-700 transition-colors"
                >
                    ⚙
                </button>
                {gameState.status === "ENDED" ? (
                    <button
                        onClick={handleCopyStory}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg font-bold text-lg shadow-lg transition-all flex items-center gap-2"
                    >
                        <span>📄</span> Copy Full Story
                    </button>
                ) : gameState.status === "PAUSED" ? (
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

            {/* Edit Modal */}
            {editingSegment && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-zinc-800 p-8 rounded-xl max-w-lg w-full border border-zinc-700 shadow-2xl">
                        <h2 className="text-xl font-bold mb-4">Edit Story Segment</h2>
                        <input
                            type="text"
                            value={editingSegment.text}
                            onChange={(e) => setEditingSegment({ ...editingSegment, text: e.target.value })}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded p-4 text-xl mb-8 focus:ring-2 focus:ring-indigo-500 outline-none font-serif text-white/90"
                            autoFocus
                        />
                        <div className="flex justify-between gap-4">
                            <button
                                onClick={() => {
                                    if (confirm("Permanently delete this part of the story?")) {
                                        gameService.deleteStorySegment(gameId, editingSegment.id);
                                        setEditingSegment(null);
                                    }
                                }}
                                className="bg-red-900/30 hover:bg-red-900/50 text-red-200 px-4 py-3 rounded-lg font-bold border border-red-800/50 transition-colors"
                            >
                                Delete
                            </button>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setEditingSegment(null)}
                                    className="px-6 py-3 rounded-lg font-bold hover:bg-zinc-700 text-zinc-300 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        gameService.updateStorySegment(gameId, editingSegment.id, editingSegment.text);
                                        setEditingSegment(null);
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-lg font-bold shadow-lg transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <SettingsModal
                gameId={gameId}
                settings={gameState.settings}
                isOpen={showSettings}
                onClose={() => setShowSettings(false)}
            />
        </div>
    );
}

function SettingsModal({ gameId, settings, isOpen, onClose }: { gameId: string, settings: any, isOpen: boolean, onClose: () => void }) {
    const [localSettings, setLocalSettings] = useState(settings || { wordLimit: 3, turnTimeLimit: 30 });

    useEffect(() => {
        if (isOpen && settings) setLocalSettings(settings);
    }, [isOpen, settings]);

    if (!isOpen) return null;

    const handleSave = () => {
        gameService.updateSettings(gameId, localSettings);
        onClose();
    };

    const handleClearPlayers = () => {
        if (confirm("NUCLEAR OPTION: This will kick EVERYONE out of the game. Are you sure?")) {
            gameService.clearPlayers(gameId);
            onClose();
        }
    };

    const handleEndGame = () => {
        if (confirm("Are you sure you want to END the story now? This cannot be undone.")) {
            gameService.endGame(gameId);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-800 p-8 rounded-xl max-w-lg w-full border border-zinc-700 shadow-2xl">
                <h2 className="text-2xl font-bold mb-6 text-white border-b border-zinc-700 pb-2">Game Settings</h2>

                {/* Word Limit Slider */}
                <div className="mb-6">
                    <label className="block text-zinc-400 mb-2">Word Limit: <span className="text-white font-bold">{localSettings.wordLimit}</span></label>
                    <input
                        type="range" min="1" max="5"
                        value={localSettings.wordLimit}
                        onChange={(e) => setLocalSettings({ ...localSettings, wordLimit: parseInt(e.target.value) })}
                        className="w-full accent-indigo-500 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                        <span>1</span><span>5</span>
                    </div>
                </div>

                {/* Turn Timer Slider */}
                <div className="mb-8">
                    <label className="block text-zinc-400 mb-2">Turn Timer (Seconds): <span className="text-white font-bold">{localSettings.turnTimeLimit}s</span></label>
                    <input
                        type="range" min="10" max="60" step="5"
                        value={localSettings.turnTimeLimit}
                        onChange={(e) => setLocalSettings({ ...localSettings, turnTimeLimit: parseInt(e.target.value) })}
                        className="w-full accent-indigo-500 h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-xs text-zinc-500 mt-1">
                        <span>10s</span><span>60s</span>
                    </div>
                </div>

                {/* Dangerous Actions */}
                <div className="flex flex-col sm:flex-row justify-between gap-4 border-t border-zinc-700 pt-6 items-center">
                    <div className="flex flex-col gap-3 items-start">
                        <button
                            onClick={handleEndGame}
                            className="text-amber-500 text-sm hover:text-amber-400 font-bold"
                        >
                            🛑 End Story
                        </button>
                        <button
                            onClick={handleClearPlayers}
                            className="text-red-500 text-sm hover:text-red-400 hover:bg-red-950/30 px-2 py-1 -ml-2 rounded"
                        >
                            ⚠️ Clear All Players
                        </button>
                    </div>

                    <div className="flex gap-3 w-full sm:w-auto justify-end">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-lg font-bold hover:bg-zinc-700 text-zinc-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Leaderboard({ players, currentPlayerId }: { players: Record<string, any>, currentPlayerId: string | null }) {
    const sortedPlayers = Object.values(players)
        .filter((p: any) => p.isActive)
        .sort((a: any, b: any) => {
            const timeA = a.totalResponseTime || 0;
            const timeB = b.totalResponseTime || 0;
            if (timeA !== timeB) return timeA - timeB; // ASC
            return (a.turnCount || 0) - (b.turnCount || 0);
        });

    return (
        <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50 flex flex-col h-full">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-zinc-300">
                <span>🏆</span> LEADERBOARD
            </h2>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {sortedPlayers.map((player: any, index: number) => {
                    const isCurrent = player.id === currentPlayerId;
                    const totalSeconds = ((player.totalResponseTime || 0) / 1000).toFixed(1);

                    return (
                        <div
                            key={player.id}
                            className={`flex items-center justify-between p-2 rounded-lg border transition-all text-sm ${isCurrent
                                ? "bg-zinc-700 border-zinc-500 shadow-md transform scale-102"
                                : "bg-zinc-800/50 border-zinc-700/30"
                                }`}
                        >
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="font-mono text-zinc-600 w-4 text-right text-xs">
                                    {index + 1}.
                                </span>
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: player.color }}
                                />
                                <span className={`truncate max-w-[100px] font-bold ${isCurrent ? "text-white" : "text-zinc-400"}`}>
                                    {player.name}
                                </span>
                            </div>
                            <div className="font-mono text-indigo-400 font-bold text-xs">
                                {totalSeconds}s
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
