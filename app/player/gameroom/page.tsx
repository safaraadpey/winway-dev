import { Suspense } from "react";
import GameRoomClient from "./GameRoomClient";

export default function GameRoomPage() {
  return (
    <Suspense fallback={null}>
      <GameRoomClient />
    </Suspense>
  );
}
