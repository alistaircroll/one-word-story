"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { gameService } from "@/services/gameService";
import { GameState, Player } from "@/types";
import { ref, get, child } from "firebase/database";
import { db } from "@/lib/firebase";
import { GAME_RULES, TIMERS } from "@/lib/constants";

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

    // Client-side Timer Logic (Moved up to fix Hook Error)
    const [timeLeft, setTimeLeft] = useState(0);

    // Input State (Moved up to fix Hook Error)
    const [inputText, setInputText] = useState("");

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
        checkPlayer();
    }, [playerId, gameId]);

    // 2.5 Setup Presence & Heartbeat
    useEffect(() => {
        if (!gameId || !playerId || !playerData) return;

        // Set up disconnect handler
        gameService.setupPresence(gameId, playerId);

        // Heartbeat interval
        const interval = setInterval(() => {
            gameService.heartbeat(gameId, playerId);
        }, TIMERS.HEARTBEAT_INTERVAL);

        return () => clearInterval(interval);
    }, [gameId, playerId, playerData?.id]); // Only run once we are identified

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

    // 4. Timer calculation
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
        const interval = setInterval(tick, 100); // More frequent for smooth progress bar
        return () => clearInterval(interval);
    }, [gameState?.timerStartedAt, gameState?.status, gameState?.settings?.turnTimeLimit]);

    // 5. Sound & Vibration when it's my turn
    useEffect(() => {
        const isMyTurn = gameState?.currentPlayerId === playerId;
        if (isMyTurn && gameState?.status === "PLAYING") {
            // Vibration (if supported)
            if (navigator.vibrate) {
                navigator.vibrate([200, 100, 200]); // Pattern: vibrate, pause, vibrate
            }
            // Sound (simple beep using Web Audio API)
            try {
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                oscillator.frequency.value = 880; // A5 note
                oscillator.type = 'sine';
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.3);
            } catch (e) {
                // Audio not supported, ignore
            }
        }
    }, [gameState?.currentPlayerId, playerId, gameState?.status]);


    const handleSubmitName = async () => {
        if (!playerName.trim() || !gameId || !playerId) return;

        setLoading(true);
        try {
            const { color } = await gameService.joinGame(gameId, playerName, playerId);
            // Add late-joiner to turn bag if game is already playing
            await gameService.addToTurnBag(gameId, playerId);
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

    // Story Context
    const story = gameState?.story || [];
    const lastWords = story.slice(-10).map(s => s.text).join(' ');

    // Helper logic
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
            return {
                text: maxWords === 1 ? "TYPE A WORD" : "TYPE YOUR WORDS",
                color: "bg-red-400 text-white opacity-90"
            };
        }
        if (wordCount > maxWords) return { text: "TOO MANY WORDS", color: "bg-red-500 text-white" };
        return { text: "SUBMIT", color: "bg-indigo-500 hover:bg-indigo-400 text-white shadow-[0_0_40px_rgba(99,102,241,0.6)] hover:scale-105 active:scale-95" };
    };

    const buttonState = getButtonState();

    const handleSubmit = async () => {
        if (!gameId || !playerId || !canSubmit) return;
        await gameService.submitWords(gameId, playerId, inputText);
        setInputText(""); // Clear immediately
    };

    // STATE HANDLING

    const handleShare = async () => {
        const fullStory = story.map(s => s.text).join(' ');
        if (!fullStory) return;

        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'One Word Story',
                    text: fullStory,
                });
            } else {
                await navigator.clipboard.writeText(fullStory);
                alert("Story copied to clipboard!");
            }
        } catch (err) {
            // Share cancelled or failed
        }
    };

    if (isEnded) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex flex-col items-center justify-center text-center animate-fade-in">
                <h1 className="text-6xl font-serif font-bold mb-6 text-indigo-500">THE END.</h1>
                <p className="text-zinc-400 text-lg mb-12">A masterpiece, surely.</p>

                <div className="flex flex-col gap-4 w-full max-w-xs">
                    <button
                        onClick={handleShare}
                        className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-indigo-500 transition-all shadow-lg flex items-center justify-center gap-2 text-lg"
                    >
                        <span>📤</span> Share Story
                    </button>

                    <button
                        onClick={() => router.push('/')}
                        className="bg-zinc-800 text-zinc-400 px-8 py-4 rounded-xl font-bold hover:bg-zinc-700 transition-all"
                    >
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    if (isPaused) {
        return (
            <div className="min-h-screen bg-zinc-900 text-white p-6 flex flex-col items-center justify-center text-center">
                <h2 className="text-3xl font-bold mb-2 text-amber-500">GAME PAUSED</h2>
                <div className="w-16 h-1 bg-amber-500 mx-auto mb-6 rounded-full"></div>
                <p className="text-zinc-300 text-lg">Waiting for the host...</p>
                {lastWords && (
                    <div className="mt-8 p-6 bg-zinc-800 rounded-xl border border-zinc-700 max-w-sm">
                        <p className="text-zinc-500 text-xs uppercase mb-2">Story so far</p>
                        <p className="text-zinc-400 italic font-serif">"...{lastWords}"</p>
                    </div>
                )}
            </div>
        );
    }

    // If it's my turn
    if (view === "PLAYING" && isMyTurn) {
        const turnDuration = gameState?.settings?.turnTimeLimit || 30;
        const timerPercent = Math.max(0, Math.min(100, (timeLeft / turnDuration) * 100));

        return (
            <div className="min-h-screen bg-indigo-950 text-white p-6 flex flex-col items-center justify-center relative overflow-hidden">
                {/* Progress bar at top */}
                <div className="absolute top-0 left-0 right-0 h-2 bg-indigo-900">
                    <div
                        className={`h-full transition-all duration-100 ${timerPercent < 33 ? 'bg-red-500' : timerPercent < 66 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${timerPercent}%` }}
                    />
                </div>

                {/* Story context */}
                {lastWords && (
                    <div className="absolute top-6 left-0 right-0 px-6">
                        <p className="text-center text-indigo-300/70 text-lg italic truncate">
                            ...{lastWords}
                        </p>
                    </div>
                )}

                <div className="animate-bounce mb-6 text-center">
                    <span className="text-6xl">🫵</span>
                </div>
                <h1 className="text-5xl font-black mb-4 tracking-tight drop-shadow-lg">YOUR TURN!</h1>

                <div className="font-mono text-3xl mb-12 bg-indigo-900/50 px-6 py-2 rounded-full border border-indigo-500/30 backdrop-blur-sm">
                    {Math.ceil(timeLeft)}s
                </div>

                <div className="w-full max-w-md">
                    <div className="relative">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                            className="w-full p-6 text-zinc-900 bg-white rounded-2xl text-3xl font-bold text-center focus:outline-none focus:ring-8 focus:ring-indigo-500/50 shadow-2xl"
                            placeholder={maxWords === 1 ? "Type a word..." : `Type ${maxWords} words...`}
                            autoFocus
                            autoComplete="off"
                        />
                        {/* Word Count Badge */}
                        <div className={`absolute -bottom-8 right-0 text-sm font-bold tracking-wider ${wordCount > maxWords ? 'text-red-400 animate-pulse' : 'text-indigo-300'}`}>
                            {wordCount} / {maxWords} WORDS
                        </div>
                    </div>

                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        className={`
                                w-full font-black py-6 mt-12 rounded-2xl text-2xl tracking-widest uppercase transition-all transform
                                ${canSubmit ? buttonState.color : `${buttonState.color} cursor-not-allowed`}
                            `}
                    >
                        {buttonState.text}
                    </button>
                    {!canSubmit && wordCount > 0 && (
                        <p className="text-center mt-4 text-indigo-400/80 text-sm">
                            {wordCount > maxWords ? `Maximum ${maxWords} word${maxWords > 1 ? 's' : ''} allowed!` : "Type something!"}
                        </p>
                    )}
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

                {lastWords && (
                    <div className="my-6 p-4 bg-zinc-900/50 rounded-lg border border-zinc-700/50">
                        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">Latest Story</p>
                        <p className="text-zinc-300 italic font-serif leading-relaxed">"...{lastWords}"</p>
                    </div>
                )}

                {gameState?.status === "PLAYING" ? (
                    <div className="mt-4">
                        <p className="text-zinc-400 animate-pulse">Waiting for turn...</p>
                        {gameState.currentPlayerId && (
                            <div className="bg-zinc-900/50 rounded p-2 mt-4 inline-block">
                                <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Current Turn</p>
                                <p className="font-bold text-indigo-400">
                                    {gameState.players?.[gameState.currentPlayerId]?.name || "Unknown"}
                                </p>
                            </div>
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
