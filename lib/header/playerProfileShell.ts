/**
 * localStorage shell for player header profile (name, avatar, KYC).
 * Instant first paint; network hydrate updates cache in background.
 */

export type PlayerProfileShell = {
  playerName: string;
  avatarId: string;
  kycVerified: boolean;
  fetchedAt: number;
};

export const PLAYER_PROFILE_SHELL_KEY = "winway.header.profile.v1";

export const DEFAULT_PLAYER_PROFILE_SHELL: PlayerProfileShell = {
  playerName: "اسم بازیکن",
  avatarId: "001",
  kycVerified: false,
  fetchedAt: 0,
};

export function readPlayerProfileShell(): PlayerProfileShell | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAYER_PROFILE_SHELL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PlayerProfileShell>;
    if (
      typeof parsed.playerName !== "string" ||
      typeof parsed.avatarId !== "string" ||
      typeof parsed.kycVerified !== "boolean"
    ) {
      return null;
    }
    return {
      playerName: parsed.playerName,
      avatarId: parsed.avatarId,
      kycVerified: parsed.kycVerified,
      fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writePlayerProfileShell(shell: PlayerProfileShell): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYER_PROFILE_SHELL_KEY, JSON.stringify(shell));
  } catch {
    // ignore quota / private mode
  }
}

export function clearPlayerProfileShell(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAYER_PROFILE_SHELL_KEY);
  } catch {
    // ignore
  }
}
