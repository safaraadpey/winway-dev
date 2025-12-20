import { Suspense } from "react";
import GameRoomClient from "./GameRoomClient";

export default function GameRoomPage() {
  // useSearchParams در Client Component استفاده می‌شود و باید داخل Suspense قرار بگیرد
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black/40 text-white">
          <div className="px-4 pt-4 space-y-4">
            <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="h-5 w-44 rounded-md bg-white/10" />
              <div className="h-4 w-64 rounded-md bg-white/10" />
            </div>

            <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
              <div className="h-4 w-40 rounded-md bg-white/10" />
              <div className="space-y-2">
                <div className="h-10 rounded-xl bg-white/10" />
                <div className="h-10 rounded-xl bg-white/10" />
                <div className="h-10 rounded-xl bg-white/10" />
              </div>
            </div>
          </div>
        </div>
      }
    >
      <GameRoomClient />
    </Suspense>
  );
}

