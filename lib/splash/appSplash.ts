/** In-app full-screen splash (player PWA / non-admin host). */

export const APP_SPLASH_IMAGE_PATH = "/images/splash.webp";

/** Session flag cleared on Hard Exit (`winway_*` keys). */
export const APP_SPLASH_SESSION_KEY = "winway_app_splash_dismissed";

/**
 * Minimum splash visibility from boot (head script `__WINWAY_SPLASH_START__`).
 * Increase for a longer branded hold; decrease for snappier entry.
 */
export const APP_SPLASH_TARGET_VISIBLE_MS = 2200;

/** Never block longer than this (slow network / missing splash.webp). */
export const APP_SPLASH_MAX_VISIBLE_MS = 6000;

export const APP_SPLASH_FADE_MS = 320;

export const APP_SPLASH_SHELL_ID = "winway-app-shell";
export const APP_SPLASH_OVERLAY_ID = "winway-app-splash";

export const APP_SPLASH_START_MARK = "__WINWAY_SPLASH_START__";

/** Matches app shell `max-w-[390px]` in root layout. */
export const APP_SPLASH_MAX_WIDTH_PX = 390;

export function getAppSplashCriticalCss(): string {
  return `
html:not([data-splash-phase="done"]) {
  overflow: hidden;
  height: 100%;
}
html:not([data-splash-phase="done"]) body {
  overflow: hidden;
  overscroll-behavior: none;
}
html:not([data-splash-phase="done"]) #${APP_SPLASH_SHELL_ID} {
  visibility: hidden;
}
#${APP_SPLASH_OVERLAY_ID} {
  position: fixed;
  top: 0;
  bottom: 0;
  left: 50%;
  z-index: 2147483646;
  box-sizing: border-box;
  width: 100%;
  max-width: ${APP_SPLASH_MAX_WIDTH_PX}px;
  height: 100dvh;
  min-height: 100dvh;
  margin: 0;
  transform: translateX(-50%);
  padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
    env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  border: 0;
  background-color: #000000;
  background-image: url("${APP_SPLASH_IMAGE_PATH}");
  background-size: cover;
  background-position: center center;
  background-repeat: no-repeat;
  opacity: 1;
  transition: opacity ${APP_SPLASH_FADE_MS}ms ease-out;
  pointer-events: auto;
  touch-action: none;
}
#${APP_SPLASH_OVERLAY_ID}[data-fading="true"] {
  opacity: 0;
  pointer-events: none;
}
html[data-splash-phase="done"] #${APP_SPLASH_OVERLAY_ID} {
  display: none;
}
`.trim();
}

export function getAppSplashBootScript(): string {
  const key = APP_SPLASH_SESSION_KEY;
  const startMark = APP_SPLASH_START_MARK;
  return `
(function () {
  try {
    window.${startMark} = performance.now();
    if (sessionStorage.getItem("${key}") === "1") {
      document.documentElement.setAttribute("data-splash-phase", "done");
    }
  } catch (e) {}
})();
`.trim();
}
