"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { gameService } from "@/services/gameService";
import { GameState } from "@/types";
import { GAME_RULES, LEADERBOARD } from "@/lib/constants";

export default function HostGamePage() {
    const params = useParams();
    const gameId = params.gameId as string;
    const router = useRouter();

    const [gameState, setGameState] = useState<GameState | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!gameId) return;

        const unsubscribe = gameService.subscribeToGame(gameId, (data) => {
            setGameState(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [gameId]);

    useEffect(() => {
        if (!gameState || gameState.status !== "PLAYING") return;

        const players = gameState.players || {};
        const activeCount = Object.values(players).filter(p => p.isActive).length;

        if (activeCount < GAME_RULES.MIN_PLAYERS) {
            gameService.pauseGame(gameId);
        }
    }, [gameState, gameId]);

    if (loading) {
        return (
            <div className="app min-h-screen flex items-center justify-center">
                <div className="animate-pulse text-lg">Loading game...</div>
            </div>
        );
    }

    if (!gameState) {
        return (
            <div className="app min-h-screen flex flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-bold">Game Not Found</h1>
                <p className="text-dim">Return to home to create a new game.</p>
                <button onClick={() => router.push('/')} className="btn btn--secondary">
                    Home
                </button>
            </div>
        );
    }

    if (gameState.status === "LOBBY") {
        return <LobbyView gameId={gameId} gameState={gameState} />;
    }

    return <GameView gameId={gameId} gameState={gameState} />;
}

function LobbyView({ gameId, gameState }: { gameId: string, gameState: GameState }) {
    const players = Object.values(gameState.players || {});
    const activePlayers = players.filter(p => p.isActive);
    const playerCount = activePlayers.length;
    const canStart = playerCount >= GAME_RULES.MIN_PLAYERS;

    const [showSettings, setShowSettings] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const [origin, setOrigin] = useState("");
    useEffect(() => {
        setTimeout(() => setOrigin(window.location.origin), 0);
    }, []);

    const joinUrl = `${origin}/join/${gameId}`;

    return (
        <div className="app min-h-screen p-6 flex flex-col">
            <header className="flex justify-between items-center mb-8 pb-4 border-b border-faint">
                <h1 style={{ fontSize: '2.5rem', fontWeight: 700 }}>ONE WORD STORY</h1>
                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-brand-blue)' }}>LOBBY</div>
            </header>

            <div className="flex-1 grid gap-8" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
                <div className="flex flex-col items-center justify-center p-8 card--pop">
                    <div className="qr-wrapper mb-6">
                        {origin && <QRCodeSVG value={joinUrl} size={280} />}
                    </div>
                    <div className="text-center">
                        <p className="text-lg mb-2" style={{ color: 'var(--color-ink-dim)' }}>Scan to join or visit</p>
                        <div className="text-xl font-bold mb-4" style={{ color: 'var(--color-ink)' }}>
                            {joinUrl.replace(/^https?:\/\//, '')}
                        </div>
                        <p className="text-lg mb-2" style={{ color: 'var(--color-ink-dim)' }}>Room Code</p>
                        <div className="text-5xl font-bold text-accent tracking-widest">
                            {gameId}
                        </div>
                    </div>
                </div>

                <div className="flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex gap-2 items-center">
                            <h2 className="text-xl font-bold">Players</h2>
                            <div className="text-dim">{playerCount} / {GAME_RULES.MAX_PLAYERS}</div>
                        </div>
                    </div>

                    <div className="flex-1 card mb-4" style={{ minHeight: '200px' }}>
                        {playerCount === 0 ? (
                            <div className="h-full flex items-center justify-center text-dim italic">
                                Waiting for players to join...
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-3">
                                {activePlayers.map(player => (
                                    <div key={player.id} className="flex items-center gap-3 p-3">
                                        <div className="player-dot" style={{ backgroundColor: player.color }} />
                                        <span className="font-bold truncate">{player.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {playerCount > 0 && (
                        confirmClear ? (
                            <button
                                onClick={() => {
                                    gameService.clearPlayers(gameId);
                                    setConfirmClear(false);
                                }}
                                className="btn btn--danger animate-pulse mb-4"
                            >
                                Confirm Clear?
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    setConfirmClear(true);
                                    setTimeout(() => setConfirmClear(false), 3000);
                                }}
                                className="btn btn--ghost-danger mb-4"
                            >
                                Clear All Players
                            </button>
                        )
                    )}

                    <div className="flex gap-4">
                        <button onClick={() => setShowSettings(true)} className="btn btn--secondary flex-1">
                            Settings
                        </button>
                        <button
                            onClick={() => gameService.startGame(gameId)}
                            className="btn btn--primary flex-1"
                            disabled={!canStart}
                            title={!canStart ? "3 or more players must join to begin" : ""}
                            style={{ flex: 2 }}
                        >
                            Start Game
                        </button>
                    </div>
                </div>
            </div>

            {showSettings && (
                <SettingsModal
                    gameId={gameId}
                    settings={gameState.settings}
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </div >
    );
}

function useGameTimer(gameState: GameState) {
    const [timeLeft, setTimeLeft] = useState(0);
    useEffect(() => {
        if (gameState?.status === "PLAYING" && gameState.timerStartedAt) {
            const tick = () => {
                const elapsed = (Date.now() - (gameState.timerStartedAt || 0)) / 1000;
                const remaining = Math.max(0, (gameState.settings?.turnTimeLimit || 30) - elapsed);
                setTimeLeft(remaining);
            };
            tick();
            const interval = setInterval(tick, 500);
            return () => clearInterval(interval);
        } else {
            setTimeout(() => {
                if (timeLeft !== 0) setTimeLeft(0);
            }, 0);
        }
    }, [gameState, timeLeft]);
    return timeLeft;
}

function GameView({ gameId, gameState }: { gameId: string, gameState: GameState }) {
    const router = useRouter();
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

    const handleNewStory = async () => {
        const newGameId = await gameService.createGame();
        router.push(`/${newGameId}`);
    };

    const [showSettings, setShowSettings] = useState(false);
    const [editingSegment, setEditingSegment] = useState<{ id: string, text: string } | null>(null);
    const [confirmEnd, setConfirmEnd] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const [origin, setOrigin] = useState("");
    useEffect(() => {
        setTimeout(() => setOrigin(window.location.origin), 0);
    }, []);
    const joinUrl = `${origin}/join/${gameId}`;

    const storyEndRef = React.useRef<HTMLSpanElement>(null);
    useEffect(() => {
        storyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [story.length]);

    const hasTimedOut = React.useRef(false);
    useEffect(() => {
        if (
            gameState.status === "PLAYING" &&
            timeLeft <= 0.5 &&
            gameState.currentPlayerId &&
            !hasTimedOut.current
        ) {
            hasTimedOut.current = true;
            gameService.nextTurn(gameId);
        }
        if (timeLeft > 1) {
            hasTimedOut.current = false;
        }
    }, [timeLeft, gameState.status, gameState.currentPlayerId, gameId]);

    const isDanger = timeLeft < 10;

    return (
        <div className="app min-h-screen flex flex-col">
            {/* Top Bar with QR and join info */}
            <div className="flex justify-between items-center p-4 border-b border-faint bg-card sticky top-0 z-10">
                <div className="flex items-center gap-6" style={{ alignItems: 'center' }}>
                    <h1 style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>ONE WORD STORY</h1>
                    {origin && (
                        <div className="qr-inline" style={{ display: 'flex', alignItems: 'center' }}>
                            <QRCodeSVG value={joinUrl} size={64} />
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', fontSize: '1.125rem' }}>
                        <span style={{ color: 'var(--color-ink-dim)' }}>Join the story:</span>
                        <span style={{ fontWeight: 500 }}>{origin.replace(/^https?:\/\//, '')}/join/</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-brand-blue)' }}>{gameId}</span>
                    </div>
                </div>

                {/* Current Turn + Timer */}
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <div className="text-xs text-dim uppercase tracking-widest">Current Turn</div>
                        {currentPlayer ? (
                            <div className="text-xl font-bold flex items-center justify-end gap-2">
                                <span className="player-dot" style={{ background: currentPlayer.color, width: 12, height: 12 }} />
                                {currentPlayer.name}
                            </div>
                        ) : (
                            <div className="text-xl font-bold text-dim">
                                {gameState.status === "ENDED" ? "THE END" : "PAUSED"}
                            </div>
                        )}
                    </div>
                    <div className={`timer-circle ${isDanger ? 'timer-circle--danger' : ''}`}>
                        {Math.ceil(timeLeft)}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex">
                {/* Story Area */}
                <div className="flex-1 p-8 overflow-auto" style={{ maxWidth: '100%' }}>
                    <div className="story-text" style={{ maxWidth: '900px', margin: '0 auto' }}>
                        {story.length === 0 ? (
                            <span className="text-dim italic">Once upon a time...</span>
                        ) : (
                            story.map((segment) => {
                                let effectClass = "";
                                const speed = segment.metadata?.responseTime;
                                if (speed && speed <= LEADERBOARD.FAST_THRESHOLD_MS) {
                                    effectClass = "segment-fast";
                                }

                                return (
                                    <span
                                        key={segment.id}
                                        style={{ color: segment.color }}
                                        className={`story-segment ${effectClass}`}
                                        title={`By ${players[segment.authorId]?.name || "Unknown"} (Click to edit)`}
                                        onClick={() => setEditingSegment({ id: segment.id, text: segment.text })}
                                    >
                                        {segment.text}{" "}
                                    </span>
                                );
                            })
                        )}
                        {currentPlayer && (
                            <span className="story-cursor" style={{ backgroundColor: currentPlayer.color }} />
                        )}
                        <span ref={storyEndRef} />
                    </div>
                </div>

                {/* Leaderboard Sidebar */}
                {gameState.status !== 'LOBBY' && (
                    <div className="hidden lg:flex flex-col p-6 bg-card border-l w-72 z-20">
                        <Leaderboard players={players || {}} currentPlayerId={gameState.currentPlayerId} />
                    </div>
                )}
            </div>

            {/* Host Controls */}
            <div className="p-6 border-t border-faint bg-card flex justify-center gap-4">
                <button onClick={() => setShowSettings(true)} className="btn btn--secondary">
                    Settings
                </button>
                {gameState.status === "ENDED" ? (
                    <>
                        <button onClick={handleCopyStory} className="btn btn--primary btn--large">
                            Copy Full Story
                        </button>
                        <button onClick={handleNewStory} className="btn btn--primary btn--large">
                            New Story
                        </button>
                    </>
                ) : gameState.status === "PAUSED" ? (
                    <>
                        {Object.values(players).filter(p => p.isActive).length >= 2 ? (
                            <button
                                onClick={() => gameService.resumeGame(gameId)}
                                className="btn btn--primary btn--large"
                                style={{ background: 'var(--color-brand-sage)' }}
                            >
                                Resume Game
                            </button>
                        ) : (
                            <div className="text-coral font-bold flex items-center">
                                Waiting for more players to resume...
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <button onClick={() => gameService.nextTurn(gameId)} className="btn btn--secondary">
                            Skip Player
                        </button>
                        {confirmEnd ? (
                            <button
                                onClick={() => gameService.endGame(gameId)}
                                className="btn btn--danger animate-pulse"
                            >
                                Confirm End?
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    setConfirmEnd(true);
                                    setTimeout(() => setConfirmEnd(false), 3000);
                                }}
                                className="btn btn--ghost-danger"
                            >
                                End Story
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Edit Modal */}
            {editingSegment && (
                <div className="modal-overlay">
                    <div className="modal">
                        <h2 className="modal__title">Edit Story Segment</h2>
                        <input
                            type="text"
                            value={editingSegment.text}
                            onChange={(e) => setEditingSegment({ ...editingSegment, text: e.target.value })}
                            className="input input--large mb-8 text-serif"
                            autoFocus
                        />
                        <div className="flex justify-between gap-4">
                            {confirmDelete ? (
                                <button
                                    onClick={() => {
                                        gameService.deleteStorySegment(gameId, editingSegment.id);
                                        setEditingSegment(null);
                                        setConfirmDelete(false);
                                    }}
                                    className="btn btn--danger animate-pulse"
                                >
                                    Confirm Delete?
                                </button>
                            ) : (
                                <button
                                    onClick={() => {
                                        setConfirmDelete(true);
                                        setTimeout(() => setConfirmDelete(false), 3000);
                                    }}
                                    className="btn btn--ghost-danger"
                                >
                                    Delete
                                </button>
                            )}
                            <div className="flex gap-3">
                                <button onClick={() => { setEditingSegment(null); setConfirmDelete(false); }} className="btn btn--ghost">
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        gameService.updateStorySegment(gameId, editingSegment.id, editingSegment.text);
                                        setEditingSegment(null);
                                    }}
                                    className="btn btn--primary"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showSettings && (
                <SettingsModal
                    gameId={gameId}
                    settings={gameState.settings}
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </div>
    );
}

function SettingsModal({ gameId, settings, isOpen, onClose }: { gameId: string, settings: GameState['settings'], isOpen: boolean, onClose: () => void }) {
    const [localSettings, setLocalSettings] = useState(settings || { wordLimit: 3, turnTimeLimit: 30 });

    if (!isOpen) return null;

    const handleSave = () => {
        gameService.updateSettings(gameId, localSettings);
        onClose();
    };
    const adjustWordLimit = (delta: number) => {
        const newVal = Math.max(1, Math.min(5, localSettings.wordLimit + delta));
        setLocalSettings({ ...localSettings, wordLimit: newVal });
    };

    const adjustTimeLimit = (delta: number) => {
        const newVal = Math.max(10, Math.min(60, localSettings.turnTimeLimit + delta));
        setLocalSettings({ ...localSettings, turnTimeLimit: newVal });
    };

    return (
        <div className="modal-overlay">
            <div className="modal" style={{ maxWidth: '450px' }}>
                <h2 className="modal__title">Game Settings</h2>

                {/* Word Limit */}
                <div className="mb-8">
                    <label className="block text-lg font-bold mb-4">Words Per Turn</label>
                    <div className="slider-control">
                        <button
                            type="button"
                            className="slider-control__btn"
                            onClick={() => adjustWordLimit(-1)}
                        >
                            −
                        </button>
                        <input
                            type="range"
                            min="1"
                            max="5"
                            value={localSettings.wordLimit}
                            onChange={(e) => setLocalSettings({ ...localSettings, wordLimit: parseInt(e.target.value) })}
                            className="slider-control__slider"
                        />
                        <button
                            type="button"
                            className="slider-control__btn"
                            onClick={() => adjustWordLimit(1)}
                        >
                            +
                        </button>
                        <div className="slider-control__value">{localSettings.wordLimit}</div>
                    </div>
                </div>

                {/* Turn Timer */}
                <div className="mb-8">
                    <label className="block text-lg font-bold mb-4">Turn Timer (Seconds)</label>
                    <div className="slider-control">
                        <button
                            type="button"
                            className="slider-control__btn"
                            onClick={() => adjustTimeLimit(-5)}
                        >
                            −
                        </button>
                        <input
                            type="range"
                            min="10"
                            max="60"
                            step="5"
                            value={localSettings.turnTimeLimit}
                            onChange={(e) => setLocalSettings({ ...localSettings, turnTimeLimit: parseInt(e.target.value) })}
                            className="slider-control__slider"
                        />
                        <button
                            type="button"
                            className="slider-control__btn"
                            onClick={() => adjustTimeLimit(5)}
                        >
                            +
                        </button>
                        <div className="slider-control__value">{localSettings.turnTimeLimit}s</div>
                    </div>
                </div>

                <div className="flex gap-3 justify-end border-t border-faint pt-6 mt-6">
                    <button onClick={onClose} className="btn btn--ghost">Cancel</button>
                    <button onClick={handleSave} className="btn btn--primary">Save</button>
                </div>
            </div>
        </div>
    );
}

function Leaderboard({ players, currentPlayerId }: { players: NonNullable<GameState['players']>, currentPlayerId: string | null }) {
    const sortedPlayers = Object.values(players)
        .filter((p) => p.isActive)
        .sort((a, b) => {
            const timeA = a.totalResponseTime || 0;
            const timeB = b.totalResponseTime || 0;
            if (timeA !== timeB) return timeA - timeB;
            return (a.turnCount || 0) - (b.turnCount || 0);
        });

    return (
        <div className="leaderboard flex flex-col h-full">
            <h2 className="text-lg font-bold mb-4">Who&apos;s Fastest?</h2>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                {sortedPlayers.map((player) => {
                    const isCurrent = player.id === currentPlayerId;
                    const totalSeconds = ((player.totalResponseTime || 0) / 1000).toFixed(1);

                    return (
                        <div
                            key={player.id}
                            className={`leaderboard__item ${isCurrent ? 'leaderboard__item--current' : ''}`}
                        >
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div
                                    className="player-dot"
                                    style={{ backgroundColor: player.color, width: 10, height: 10 }}
                                />
                                <span className={`truncate font-bold ${isCurrent ? '' : 'text-dim'}`} style={{ maxWidth: '120px' }}>
                                    {player.name}
                                </span>
                            </div>
                            <div className="font-mono text-accent font-bold text-sm">
                                {totalSeconds}s
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
