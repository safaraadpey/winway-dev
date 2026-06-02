import { Suspense } from "react";
import PageLoading from "@/components/PageLoading";
import GameRoomClient from "./GameRoomClient";

export default function GameRoomPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <GameRoomClient />
    </Suspense>
  );
}
