import { supabase } from "@/lib/supabaseClient";
import { teardownActiveGamesForExit } from "@/lib/activeGames/teardownForExit";
import { clearGameResultsSessionStorage } from "@/lib/gameResultsDedupe";
import { clearCardPoolMemoryCache } from "@/lib/cardPool/client";
import { resetSnapshotGate } from "@/lib/activeGames/snapshotGate";
import { stopLiveRoomMusic } from "@/lib/audio/music";
import { teardownPanelForExit } from "@/lib/auth/teardownPanelForExit";

export const HARD_EXIT_EVENT = "winway:hard-exit";
export const HARD_EXIT_REDIRECT_MS = 750;

export type HardExitRole = "player" | "admin" | "agent" | "dev-panel";

export type PanelHardExitRole = Exclude<HardExitRole, "player">;

const HARD_EXIT_FLAG = "__WINWAY_HARD_EXITING__";
const OVERLAY_ID = "winway-hard-exit-overlay";

const REDIRECT_BY_ROLE: Record<HardExitRole, string> = {
  player: "/login",
  admin: "/admin/login",
  agent: "/agent/login",
  "dev-panel": "/dev-panel/login",
};

export function resolvePanelHardExitRole(pathname?: string): PanelHardExitRole | null {
  const path = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  if (path.startsWith("/dev-panel")) return "dev-panel";
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/agent")) return "agent";
  return null;
}

/**
 * Hard exit based on the current panel route.
 * Covers admin sub-roles on /admin/*, dev_panel on /dev-panel/*, and agent/super on /agent/*.
 */
export function hardExitFromCurrentPanel(): void {
  const role = resolvePanelHardExitRole();
  hardExit(role ?? "player");
}

export function isHardExiting(): boolean {
  if (typeof window === "undefined") return false;
  return (window as unknown as Record<string, boolean>)[HARD_EXIT_FLAG] === true;
}

function setHardExiting(): void {
  if (typeof window === "undefined") return;
  (window as unknown as Record<string, boolean>)[HARD_EXIT_FLAG] = true;
}

function showExitingOverlay(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ID)) return;

  document.body.style.pointerEvents = "none";
  document.body.style.userSelect = "none";
  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("role", "alert");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.78)",
    color: "#ffffff",
    fontFamily: "Vazirmatn, sans-serif",
    fontSize: "18px",
    fontWeight: "600",
    letterSpacing: "0.02em",
    pointerEvents: "auto",
  });
  overlay.textContent = "Exiting...";
  document.body.appendChild(overlay);
}

function teardownRealtimeSubscriptions(): void {
  try {
    const channels = supabase.getChannels();
    for (const channel of channels) {
      try {
        void supabase.removeChannel(channel);
      } catch {
        // ignore per-channel teardown errors
      }
    }
    void supabase.removeAllChannels();
  } catch {
    // ignore
  }

  try {
    void supabase.realtime.setAuth(null);
  } catch {
    // ignore
  }
}

function clearAuthAndAppStorage(): void {
  if (typeof window === "undefined") return;

  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith("sb-") ||
        key.includes("-auth-token") ||
        key.startsWith("winway_") ||
        key.startsWith("winway.header.")
      ) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }

  try {
    const sessionKeysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (key.startsWith("winway_")) {
        sessionKeysToRemove.push(key);
      }
    }
    for (const key of sessionKeysToRemove) {
      sessionStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function teardownAppState(role: HardExitRole): void {
  if (role === "player") {
    teardownActiveGamesForExit();

    try {
      clearGameResultsSessionStorage();
    } catch {
      // ignore
    }

    try {
      resetSnapshotGate();
    } catch {
      // ignore
    }

    try {
      clearCardPoolMemoryCache();
    } catch {
      // ignore
    }

    try {
      stopLiveRoomMusic();
    } catch {
      // ignore
    }
  } else {
    teardownPanelForExit(role);
  }

  teardownRealtimeSubscriptions();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HARD_EXIT_EVENT));
  }
}

function redirectToLogin(role: HardExitRole): void {
  if (typeof window === "undefined") return;
  window.location.replace(REDIRECT_BY_ROLE[role]);
}

/**
 * Hard logout / safe exit.
 * Does not depend on router navigation, in-flight API calls, or signOut success.
 */
export function hardExit(role: HardExitRole = "player"): void {
  if (typeof window === "undefined") return;
  if (isHardExiting()) return;

  setHardExiting();
  showExitingOverlay();
  teardownAppState(role);
  clearAuthAndAppStorage();

  void supabase.auth.signOut().catch(() => {
    // best-effort only
  });

  void fetch("/api/watch/clear-guest", { method: "POST", cache: "no-store" }).catch(
    () => {
      // best-effort only — HttpOnly guest cookie cannot be cleared from document.cookie
    }
  );

  window.setTimeout(() => redirectToLogin(role), HARD_EXIT_REDIRECT_MS);
}
