/**
 * Early PWA install bootstrap (inline in <head>).
 * Captures beforeinstallprompt before React hydration and registers SW in production.
 */

export const PWA_DEFERRED_PROMPT_KEY = "__WINWAY_DEFERRED_INSTALL_PROMPT__";

export const PWA_EVENT_BEFORE_INSTALL = "winway:pwa-beforeinstallprompt";
export const PWA_EVENT_APP_INSTALLED = "winway:pwa-appinstalled";
export const PWA_EVENT_SW_READY = "winway:pwa-sw-ready";

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export type WinwayWindow = Window &
  typeof globalThis & {
    [PWA_DEFERRED_PROMPT_KEY]?: BeforeInstallPromptEvent | null;
  };

export function getDeferredInstallPrompt(): BeforeInstallPromptEvent | null {
  if (typeof window === "undefined") return null;
  return (window as WinwayWindow)[PWA_DEFERRED_PROMPT_KEY] ?? null;
}

export function clearDeferredInstallPrompt(): void {
  if (typeof window === "undefined") return;
  (window as WinwayWindow)[PWA_DEFERRED_PROMPT_KEY] = null;
}

export function getPwaInstallBootstrapScript(registerServiceWorkerInHead: boolean): string {
  const swBlock = registerServiceWorkerInHead
    ? `
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .then(function (reg) {
          log("service worker registered", { scope: reg.scope });
          return navigator.serviceWorker.ready;
        })
        .then(function (reg) {
          log("service worker ready", { active: Boolean(reg.active) });
          if (navigator.serviceWorker.controller) {
            log("service worker controlling");
          } else {
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              function onControl() {
                log("service worker controlling");
              },
              { once: true }
            );
          }
          window.dispatchEvent(new Event("${PWA_EVENT_SW_READY}"));
        })
        .catch(function (err) {
          console.warn("[PWA] service worker registration failed", err);
        });
    }`
    : "";

  return `
(function () {
  function log(msg, detail) {
    try {
      var debug =
        /localhost|127\\.0\\.0\\.1/.test(location.hostname) ||
        localStorage.getItem("winway_pwa_debug") === "1";
      if (!debug) return;
      if (detail !== undefined) console.info("[PWA] " + msg, detail);
      else console.info("[PWA] " + msg);
    } catch (e) {}
  }

  window.${PWA_DEFERRED_PROMPT_KEY} = null;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    window.${PWA_DEFERRED_PROMPT_KEY} = e;
    log("beforeinstallprompt received");
    window.dispatchEvent(new Event("${PWA_EVENT_BEFORE_INSTALL}"));
  });

  window.addEventListener("appinstalled", function () {
    log("appinstalled fired");
    window.${PWA_DEFERRED_PROMPT_KEY} = null;
    window.dispatchEvent(new Event("${PWA_EVENT_APP_INSTALLED}"));
  });

  var manifestLink = document.querySelector('link[rel="manifest"]');
  if (manifestLink) {
    log("manifest linked", { href: manifestLink.getAttribute("href") });
  }
  ${swBlock}
})();
`.trim();
}

/** Grace period after SW ready before treating install as unavailable in UI. */
export const PWA_PROMPT_GRACE_MS = 8000;
