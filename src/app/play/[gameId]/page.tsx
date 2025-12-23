"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { gameService } from "@/services/gameService";
import { GameState, Player } from "@/types";
import { ref, get } from "firebase/database";
import { db } from "@/lib/firebase";
import { TIMERS, LEADERBOARD } from "@/lib/constants";

function PlayerLogic() {
    const params = useParams();
    const gameId = params.gameId as string;
    const searchParams = useSearchParams();
    const router = useRouter();

    const playerIdParam = searchParams.get('p');
    const inputRef = useRef<HTMLInputElement>(null);
    const gameInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<"NAME_ENTRY" | "WAITING" | "PLAYING">("NAME_ENTRY");
    const [playerName, setPlayerName] = useState("");
    const [playerId, setPlayerId] = useState<string | null>(null);
    const [playerData, setPlayerData] = useState<Player | null>(null);
    const [gameState, setGameState] = useState<GameState | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [timeLeft, setTimeLeft] = useState(0);
    const [inputText, setInputText] = useState("");
    const [confirmLeave, setConfirmLeave] = useState(false);

    const lastToastSegmentId = useRef<string | null>(null);

    useEffect(() => {
        if (!playerIdParam) {
            const newId = `player_${uuidv4()}`;
            router.replace(`/play/${gameId}?p=${newId}`);
        } else {
            setPlayerId(playerIdParam);
        }
    }, [playerIdParam, gameId, router]);

    useEffect(() => {
        if (!playerId || !gameId) return;

        const checkPlayer = async () => {
            try {
                const pRef = ref(db, `games/${gameId}/players/${playerId}`);
                const snapshot = await get(pRef);

                if (snapshot.exists()) {
                    const pData = snapshot.val();
                    setPlayerData(pData);
                    setView("WAITING");
                } else {
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

    useEffect(() => {
        if (!gameId || !playerId || !playerData) return;

        gameService.setupPresence(gameId, playerId);

        const interval = setInterval(() => {
            gameService.heartbeat(gameId, playerId);
        }, TIMERS.HEARTBEAT_INTERVAL);

        return () => clearInterval(interval);
    }, [gameId, playerId, playerData?.id]);

    useEffect(() => {
        if (!gameId) return;
        const unsubscribe = gameService.subscribeToGame(gameId, (data) => {
            setGameState(data);
            if (data && data.status === "PLAYING" && view === "WAITING") {
                setView("PLAYING");
            }
        });
        return () => unsubscribe();
    }, [gameId, view]);

    useEffect(() => {
        if (!gameState?.story || gameState.story.length === 0 || !playerId) return;

        const lastSegment = gameState.story[gameState.story.length - 1];
        if (lastToastSegmentId.current === lastSegment.id) return;

        if (lastSegment.authorId === playerId && (Date.now() - lastSegment.timestamp < 5000)) {
            const speed = lastSegment.metadata?.responseTime;
            if (speed && speed <= LEADERBOARD.FAST_THRESHOLD_MS) {
                lastToastSegmentId.current = lastSegment.id;
                // Toast removed as per unused var warning
                // setToast({ visible: true, message: `${(speed / 1000).toFixed(1)}s` });
                // setTimeout(() => setToast({ visible: false, message: "" }), 2500);
            }
        }
    }, [gameState?.story?.length, playerId]);

    useEffect(() => {
        if (gameState?.status !== "PLAYING" || !gameState.timerStartedAt) {
            setTimeLeft(0);
            return;
        }
        const tick = () => {
            const elapsed = (Date.now() - (gameState.timerStartedAt || 0)) / 1000;
            const remaining = Math.max(0, (gameState.settings?.turnTimeLimit || 30) - elapsed);
            setTimeLeft(remaining);
        };
        tick();
        const interval = setInterval(tick, 100);
        return () => clearInterval(interval);
    }, [gameState?.timerStartedAt, gameState?.status, gameState?.settings?.turnTimeLimit]);

    useEffect(() => {
        const isMyTurn = gameState?.currentPlayerId === playerId;
        if (isMyTurn && gameState?.status === "PLAYING") {
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]);
            }
            try {
                const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
                const audioContext = new AudioContextCtor();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = 880;
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            } catch {
                // Audio not supported
            }
        }
    }, [gameState?.currentPlayerId, playerId, gameState?.status]);

    // Auto-focus input on name entry
    useEffect(() => {
        if (view === "NAME_ENTRY" && !loading && inputRef.current) {
            inputRef.current.focus();
        }
    }, [view, loading]);

    // Auto-focus game input on turn
    useEffect(() => {
        if (view === "PLAYING" && gameState?.currentPlayerId === playerId && gameInputRef.current) {
            // Small timeout to ensure render
            setTimeout(() => gameInputRef.current?.focus(), 50);
        }
    }, [view, gameState?.currentPlayerId, playerId]);

    const handleSubmitName = async () => {
        if (!playerName.trim() || !gameId || !playerId) return;

        setLoading(true);
        try {
            const { color } = await gameService.joinGame(gameId, playerName, playerId);
            await gameService.addToTurnBag(gameId, playerId);
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
        if (confirm("Are you sure you want to leave this story?")) {
            if (gameId && playerId) {
                await gameService.leaveGame(gameId, playerId);
            }
            router.push('/');
        }
    };

    if (!playerIdParam) return null;
    if (loading) return <div className="app min-h-screen flex items-center justify-center"><div className="animate-pulse text-lg">Loading...</div></div>;
    if (error) return <div className="app min-h-screen flex items-center justify-center text-coral">{error}</div>;

    // --- NAME ENTRY VIEW ---
    if (view === "NAME_ENTRY") {
        return (
            <div className="app min-h-screen p-6 flex flex-col items-center justify-center">
                <div className="w-full max-w-sm text-center">
                    <h1 className="text-2xl font-bold mb-8">Join Story</h1>
                    <input
                        ref={inputRef}
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmitName()}
                        className="input input--large w-full mb-2"
                        placeholder="Enter name..."
                        maxLength={12}
                        autoFocus
                    />
                    <div className="text-right text-xs text-dim mb-4">
                        {playerName.length}/12
                    </div>
                    <button
                        onClick={handleSubmitName}
                        disabled={!playerName.trim()}
                        className="btn btn--primary btn--large w-full"
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

    const story = gameState?.story || [];
    const lastWords = story.slice(-15).map(s => s.text).join(' ');

    const countWords = (input: string): number => {
        const trimmed = input.trim();
        if (trimmed === '') return 0;
        const tokens = trimmed.split(/\s+/);
        const words = tokens.map(t => t.replace(/^[^\w]+|[^\w]+$/g, '')).filter(t => t.length > 0);
        return words.length;
    };

    const wordCount = countWords(inputText);
    const maxWords = gameState?.settings?.wordLimit ?? 3;
    const canSubmit = wordCount >= 1 && wordCount <= maxWords;

    const getButtonState = () => {
        if (wordCount === 0) {
            return { text: maxWords === 1 ? "TYPE A WORD" : "TYPE YOUR WORDS", disabled: true };
        }
        if (wordCount > maxWords) return { text: "TOO MANY WORDS", disabled: true };
        return { text: "SUBMIT", disabled: false };
    };

    const buttonState = getButtonState();

    const handleSubmit = async () => {
        if (!gameId || !playerId || !canSubmit) return;
        await gameService.submitWords(gameId, playerId, inputText);
        setInputText("");
    };

    const handleShare = async () => {
        const fullStory = story.map(s => s.text).join(' ');
        if (!fullStory) return;

        try {
            if (navigator.share) {
                await navigator.share({ title: 'One Word Story', text: fullStory });
            } else {
                await navigator.clipboard.writeText(fullStory);
                alert("Story copied to clipboard!");
            }
        } catch {
            // Share cancelled
        }
    };

    if (isEnded) {
        const fullStory = story.map(s => s.text).join(' ');
        return (
            <div className="app min-h-screen p-6 flex flex-col items-center text-center animate-fade-in">
                <h1 className="text-4xl font-bold mb-6 text-accent">THE END</h1>

                <div className="flex-1 w-full max-w-lg overflow-y-auto mb-6">
                    <div className="card p-6 text-left">
                        <p className="text-serif text-lg" style={{ lineHeight: 1.8 }}>
                            {fullStory || "No story was written."}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col gap-4 w-full max-w-xs">
                    <button onClick={handleShare} className="btn btn--primary btn--large w-full">
                        Share Story
                    </button>
                    <button onClick={() => router.push('/')} className="btn btn--secondary w-full">
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    if (isPaused) {
        return (
            <div className="app min-h-screen p-6 flex flex-col items-center justify-center text-center">
                <h2 className="text-3xl font-bold mb-2 text-coral">GAME PAUSED</h2>
                <div style={{ width: 64, height: 4, background: 'var(--color-brand-coral)', borderRadius: 2 }} className="mb-6" />
                <p className="text-lg">Waiting for the host...</p>
                {lastWords && (
                    <div className="mt-8 card--subtle max-w-sm text-center">
                        <p className="text-xs uppercase tracking-widest text-dim mb-2">Story so far</p>
                        <p className="text-serif italic text-dim">&quot;...{lastWords}&quot;</p>
                    </div>
                )}
            </div>
        );
    }

    // MY TURN VIEW
    if (view === "PLAYING" && isMyTurn) {
        const turnDuration = gameState?.settings?.turnTimeLimit || 30;
        const timerPercent = Math.max(0, Math.min(100, (timeLeft / turnDuration) * 100));
        const isDanger = timerPercent < 33;

        return (
            <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-brand-blue)' }}>
                {/* Progress bar */}
                <div className="progress-bar" style={{ borderRadius: 0, height: 8 }}>
                    <div
                        className={`progress-bar__fill ${isDanger ? 'progress-bar__fill--warning' : ''}`}
                        style={{ width: `${timerPercent}%` }}
                    />
                </div>

                {/* Story preview - consistent position at top */}
                {lastWords && (
                    <div className="p-4 flex justify-center">
                        <div className="card--subtle max-w-md text-center" style={{ background: 'rgba(255,255,255,0.95)' }}>
                            <p className="text-lg italic" style={{ lineHeight: 1.5, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                                &ldquo;...{lastWords}&rdquo;
                            </p>
                        </div>
                    </div>
                )}

                {/* Main content - centered */}
                <div className="flex-1 flex flex-col items-center justify-center p-6">
                    <div
                        className="timer mb-6 px-6 py-3 rounded"
                        style={{
                            background: isDanger ? 'var(--color-brand-coral)' : 'rgba(255,255,255,0.2)',
                            color: 'white',
                            fontSize: 'var(--font-size-3xl)'
                        }}
                    >
                        {Math.ceil(timeLeft)}s
                    </div>

                    <div className="w-full max-w-md">
                        <input
                            ref={gameInputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                            className="input input--large w-full"
                            style={{ fontSize: 'var(--font-size-2xl)' }}
                            placeholder={maxWords === 1 ? "Type a word..." : `Type ${maxWords} words...`}
                            autoComplete="off"
                        />

                        <div className="text-center mt-3 text-sm font-bold tracking-wider" style={{ color: wordCount > maxWords ? 'var(--color-brand-coral)' : 'rgba(255,255,255,0.7)' }}>
                            {wordCount} / {maxWords} WORDS
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={buttonState.disabled}
                        className="btn btn--primary btn--large w-full max-w-md mt-6"
                        style={{
                            background: buttonState.disabled ? 'rgba(255,255,255,0.3)' : 'white',
                            color: buttonState.disabled ? 'rgba(255,255,255,0.7)' : 'var(--color-brand-blue)',
                            borderColor: buttonState.disabled ? 'transparent' : 'var(--color-ink)'
                        }}
                    >
                        {buttonState.text}
                    </button>

                    {!canSubmit && wordCount > 0 && (
                        <p className="text-center mt-3 text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
                            {wordCount > maxWords ? `Maximum ${maxWords} word${maxWords > 1 ? 's' : ''} allowed` : "Type something"}
                        </p>
                    )}
                </div>

                {/* Leave Game - always at bottom center */}
                <div className="p-6 text-center">
                    {confirmLeave ? (
                        <button
                            onClick={() => {
                                handleLeaveGame();
                                setConfirmLeave(false);
                            }}
                            className="btn btn--danger animate-pulse"
                        >
                            Confirm Leave?
                        </button>
                    ) : (
                        <button
                            onClick={() => {
                                setConfirmLeave(true);
                                setTimeout(() => setConfirmLeave(false), 3000);
                            }}
                            className="btn btn--ghost-danger"
                        >
                            Leave Game
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // WAITING SCREEN
    return (
        <div className="app min-h-screen flex flex-col">
            {/* Story preview - consistent position at top */}
            {lastWords && (
                <div className="p-4 flex justify-center">
                    <div className="card--subtle max-w-md text-center">
                        <p className="text-lg italic text-dim" style={{ lineHeight: 1.5, fontFamily: 'Georgia, "Times New Roman", serif' }}>
                            &ldquo;...{lastWords}&rdquo;
                        </p>
                    </div>
                </div>
            )}

            {/* Main content - centered */}
            <div className="flex-1 flex items-center justify-center p-6">
                <div className="w-full max-w-sm card--pop text-center p-6">
                    <div
                        className="player-avatar mx-auto mb-4"
                        style={{ backgroundColor: playerData?.color }}
                    />
                    <h2 className="text-2xl font-bold mb-4">{playerData?.name}</h2>

                    {gameState?.status === "PLAYING" ? (
                        <div>
                            <p className="text-dim animate-pulse">Waiting for turn...</p>
                            {gameState.currentPlayerId && (
                                <div className="tag mt-4">
                                    <span className="text-dim">Current: </span>
                                    <span className="font-bold text-accent">
                                        {gameState.players?.[gameState.currentPlayerId]?.name || "Unknown"}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-dim">Waiting for host to start...</p>
                    )}
                </div>
            </div>

            {/* Leave Game - always at bottom center */}
            <div className="p-6 text-center">
                {confirmLeave ? (
                    <button
                        onClick={() => {
                            handleLeaveGame();
                            setConfirmLeave(false);
                        }}
                        className="btn btn--danger animate-pulse"
                    >
                        Confirm Leave?
                    </button>
                ) : (
                    <button
                        onClick={() => {
                            setConfirmLeave(true);
                            setTimeout(() => setConfirmLeave(false), 3000);
                        }}
                        className="btn btn--ghost-danger"
                    >
                        Leave Game
                    </button>
                )}
            </div>
        </div>
    );
}

export default function PlayerPage() {
    return (
        <Suspense fallback={<div className="app min-h-screen flex items-center justify-center">Loading...</div>}>
            <PlayerLogic />
        </Suspense>
    );
}
