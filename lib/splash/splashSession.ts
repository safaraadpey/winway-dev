import {
  APP_SPLASH_DISMISSED_MARK,
  APP_SPLASH_SESSION_KEY,
} from "@/lib/splash/appSplash";

/** In-memory cache — survives AppSplashScreen remounts during soft navigation. */
let dismissedMemory: boolean | null = null;

export { APP_SPLASH_DISMISSED_MARK };

export function isSplashDismissedInSession(): boolean {
  if (dismissedMemory === true) return true;
  if (typeof window === "undefined") return false;

  const marked = (
    window as unknown as Record<string, boolean | undefined>
  )[APP_SPLASH_DISMISSED_MARK];
  if (marked === true) {
    dismissedMemory = true;
    return true;
  }

  try {
    if (sessionStorage.getItem(APP_SPLASH_SESSION_KEY) === "1") {
      dismissedMemory = true;
      return true;
    }
  } catch {
    // ignore private mode / blocked storage
  }

  return false;
}

/** Persist dismiss across sessionStorage, html phase, and in-memory cache. */
export function persistSplashDismissed(): void {
  dismissedMemory = true;

  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-splash-phase", "done");
  }

  if (typeof window !== "undefined") {
    (window as unknown as Record<string, boolean>)[APP_SPLASH_DISMISSED_MARK] =
      true;
  }

  try {
    sessionStorage.setItem(APP_SPLASH_SESSION_KEY, "1");
  } catch {
    // ignore private mode / blocked storage
  }
}

export function clearSplashDismissedMemory(): void {
  dismissedMemory = null;
  if (typeof window === "undefined") return;
  delete (window as unknown as Record<string, boolean | undefined>)[
    APP_SPLASH_DISMISSED_MARK
  ];
}
