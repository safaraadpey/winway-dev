/**
 * localStorage shell for header wallet balances.
 * Instant first paint; TTL-gated network refresh in useBalances.
 */

import { clearPlayerProfileShell } from "@/lib/header/playerProfileShell";

export type BalanceShell = {
  dingBalance: number;
  tomanBalance: number;
  lockedTomanBalance: number;
  fetchedAt: number;
};

export const BALANCE_SHELL_KEY = "winway.header.balances.v1";
export const BALANCE_SHELL_TTL_MS = 60_000;

export function readBalanceShell(): BalanceShell | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BALANCE_SHELL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BalanceShell>;
    if (
      typeof parsed.dingBalance !== "number" ||
      typeof parsed.tomanBalance !== "number" ||
      typeof parsed.lockedTomanBalance !== "number"
    ) {
      return null;
    }
    return {
      dingBalance: parsed.dingBalance,
      tomanBalance: parsed.tomanBalance,
      lockedTomanBalance: parsed.lockedTomanBalance,
      fetchedAt: typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeBalanceShell(shell: BalanceShell): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BALANCE_SHELL_KEY, JSON.stringify(shell));
  } catch {
    // ignore
  }
}

export function clearBalanceShell(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BALANCE_SHELL_KEY);
  } catch {
    // ignore
  }
}

export function isBalanceShellFresh(
  shell: BalanceShell | null,
  ttlMs = BALANCE_SHELL_TTL_MS
): boolean {
  if (!shell || shell.fetchedAt <= 0) return false;
  return Date.now() - shell.fetchedAt < ttlMs;
}

export function clearHeaderShells(): void {
  clearBalanceShell();
  clearPlayerProfileShell();
}
