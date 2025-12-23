"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GAME_RULES } from "@/lib/constants";
import { get, ref } from "firebase/database";
import { db } from "@/lib/firebase";

export default function JoinPage() {
    const params = useParams();
    const gameId = params.gameId as string;
    const router = useRouter();
    const [status, setStatus] = useState("Checking game...");

    useEffect(() => {
        async function checkGame() {
            if (!gameId) return;

            try {
                const gameRef = ref(db, `games/${gameId}`);
                const snapshot = await get(gameRef);

                if (!snapshot.exists()) {
                    setStatus("Game not found.");
                    setTimeout(() => router.push('/'), 2000);
                    return;
                }

                const gameData = snapshot.val();
                const players = gameData.players || {};
                const activeCount = Object.values(players).filter((p: any) => p.isActive).length;

                if (activeCount >= GAME_RULES.MAX_PLAYERS) {
                    setStatus("Game is full.");
                    setTimeout(() => router.push('/'), 2000);
                    return;
                }

                router.push(`/play/${gameId}`);
            } catch (error) {
                console.error(error);
                setStatus("Error joining game.");
            }
        }

        checkGame();
    }, [gameId, router]);

    return (
        <div className="app min-h-screen flex items-center justify-center p-6 text-center">
            <div className="animate-pulse text-xl font-mono">{status}</div>
        </div>
    );
}
