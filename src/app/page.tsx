"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { gameService } from "@/services/gameService";

export default function Home() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  const handleCreateGame = async () => {
    setIsCreating(true);
    try {
      const gameId = await gameService.createGame();
      router.push(`/${gameId}`);
    } catch (error) {
      console.error("Failed to create game:", error);
      alert("Failed to create game. Check console.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinGame = () => {
    if (joinCode.length === 6) {
      router.push(`/join/${joinCode}`);
    }
  };

  return (
    <main className="app min-h-screen flex flex-col p-6">
      {/* Centered content area */}
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <h1 className="text-6xl font-bold mb-6" style={{ letterSpacing: '-0.02em' }}>
          One Word Story
        </h1>
        <p className="text-2xl text-dim max-w-lg" style={{ marginBottom: '9rem' }}>
          Collaboratively write a story with your friends, one word at a time.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button
            onClick={handleCreateGame}
            disabled={isCreating}
            className="btn btn--primary btn--large w-full text-xl"
            type="button"
          >
            {isCreating ? "Creating..." : "Create New Game"}
          </button>

          <div className="flex gap-3 mt-4">
            <input
              type="text"
              placeholder="Room Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
              className="input flex-1 uppercase tracking-widest text-center text-lg"
              maxLength={6}
            />
            <button
              onClick={handleJoinGame}
              className="btn btn--secondary text-lg"
            >
              Join
            </button>
          </div>
        </div>
      </div>

      {/* Footer - natural flow at bottom */}
      <footer className="text-center text-sm text-dim py-4">
        One Word Story is a game by <a href="https://alistaircroll.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-accent transition-colors">Alistair Croll</a>.
      </footer>
    </main>
  );
}
