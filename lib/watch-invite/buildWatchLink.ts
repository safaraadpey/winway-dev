import { getMainPublicOrigin } from "@/lib/auth/portalHosts";

export function buildWatchInvitePath(
  watchCode: number,
  inviteToken: string,
  roomId?: string
): string {
  const base = `/watch/t/${watchCode}/i/${encodeURIComponent(inviteToken)}`;
  if (roomId) {
    return `${base}/room/${encodeURIComponent(roomId)}`;
  }
  return base;
}

export function buildWatchInviteUrl(watchCode: number, inviteToken: string): string {
  return `${getMainPublicOrigin()}${buildWatchInvitePath(watchCode, inviteToken)}`;
}
