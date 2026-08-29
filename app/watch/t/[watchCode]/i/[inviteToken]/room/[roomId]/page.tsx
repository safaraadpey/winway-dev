import { notFound } from "next/navigation";
import { assertWatchFinishedRoomAccess } from "@/lib/watch-invite/assertWatchFinishedRoomAccess";
import WatchFinishedRoomClient from "./WatchFinishedRoomClient";

export const dynamic = "force-dynamic";

type WatchFinishedRoomPageProps = {
  params: {
    watchCode: string;
    inviteToken: string;
    roomId: string;
  };
};

export default async function WatchFinishedRoomPage({ params }: WatchFinishedRoomPageProps) {
  const watchCode = Number(params.watchCode);
  const inviteToken = decodeURIComponent(params.inviteToken || "")
    .trim()
    .toUpperCase();
  const roomId = params.roomId;

  if (!Number.isFinite(watchCode) || watchCode <= 0 || !inviteToken || !roomId) {
    notFound();
  }

  const access = await assertWatchFinishedRoomAccess(watchCode, roomId);
  if (!access) {
    notFound();
  }

  return (
    <WatchFinishedRoomClient
      watchCode={watchCode}
      inviteToken={inviteToken}
      roomId={roomId}
    />
  );
}
