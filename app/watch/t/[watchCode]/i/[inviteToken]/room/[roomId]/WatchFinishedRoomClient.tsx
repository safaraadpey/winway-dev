"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LiveRoomScreen from "@/src/screens/LiveRoomScreen";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { buildWatchInvitePath } from "@/lib/watch-invite/buildWatchLink";

type WatchFinishedRoomClientProps = {
  watchCode: number;
  inviteToken: string;
  roomId: string;
};

export default function WatchFinishedRoomClient({
  watchCode,
  inviteToken,
  roomId,
}: WatchFinishedRoomClientProps) {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const backPath = buildWatchInvitePath(watchCode, inviteToken);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push(backPath));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [backPath, router, setOnBackClick, setShowBackButton]);

  return (
    <LiveRoomScreen
      roomId={roomId}
      guestSpectate={{ watchCode, backPath }}
    />
  );
}
