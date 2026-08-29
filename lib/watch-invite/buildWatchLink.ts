import { getMainPublicOrigin } from "@/lib/auth/portalHosts";

export function buildWatchInvitePath(watchCode: number, inviteToken: string): string {
  return `/watch/t/${watchCode}/i/${encodeURIComponent(inviteToken)}`;
}

export function buildWatchInviteUrl(watchCode: number, inviteToken: string): string {
  return `${getMainPublicOrigin()}${buildWatchInvitePath(watchCode, inviteToken)}`;
}
