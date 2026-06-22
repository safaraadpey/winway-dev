import { Suspense } from "react";
import TournamentRoomClient from "./TournamentRoomClient";
import TournamentRoomLoadingFallback from "@/components/TournamentRoomLoadingFallback";

export default function TournamentRoomPage() {
  return (
    <Suspense fallback={<TournamentRoomLoadingFallback />}>
      <TournamentRoomClient />
    </Suspense>
  );
}
