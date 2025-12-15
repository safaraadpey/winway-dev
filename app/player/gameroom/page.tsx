import { Suspense } from "react";
import GameRoomClient from "./GameRoomClient";

export default function GameRoomPage() {
  // useSearchParams در Client Component استفاده می‌شود و باید داخل Suspense قرار بگیرد
  return (
    <Suspense fallback={<div className="p-4 text-gray-600">در حال بارگذاری...</div>}>
      <GameRoomClient />
    </Suspense>
  );
}

