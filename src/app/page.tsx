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
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center sm:p-24 bg-zinc-900 text-white">
      <h1 className="text-6xl font-bold mb-4 tracking-tight">
        One Word Story
      </h1>
      <p className="text-xl mb-12 text-zinc-400 max-w-lg">
        Collaboratively write a story with your friends. One word at a time.
      </p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <button
          onClick={handleCreateGame}
          disabled={isCreating}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-6 rounded-lg text-lg transition-colors shadow-lg shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          type="button"
        >
          {isCreating ? "Creating..." : "Create New Game"}
        </button>

        <div className="flex gap-2 mt-4">
          <input
            type="text"
            placeholder="Room Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleJoinGame()}
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 uppercase tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            maxLength={6}
          />
          <button
            onClick={handleJoinGame}
            className="bg-zinc-700 hover:bg-zinc-600 px-6 rounded-lg font-bold transition-colors"
          >
            Join
          </button>
        </div>
      </div>
    </main>
  );
}
