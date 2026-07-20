import {
  PWA_EVENT_SW_READY,
} from "@/lib/pwa/pwaInstallBootstrap";
import { logPwa } from "@/lib/pwa/pwaDebug";

let registerPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Idempotent SW registration (dev / fallback when head bootstrap did not run).
 */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(null);
  }

  if (!registerPromise) {
    registerPromise = (async () => {
      try {
        const existing = await navigator.serviceWorker.getRegistration("/");
        if (existing?.active) {
          logPwa("service worker already registered", { scope: existing.scope });
          await navigator.serviceWorker.ready;
          logPwa("service worker ready", { active: true });
          if (navigator.serviceWorker.controller) {
            logPwa("service worker controlling");
          }
          window.dispatchEvent(new Event(PWA_EVENT_SW_READY));
          return existing;
        }

        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        logPwa("service worker registered", { scope: reg.scope });
        await navigator.serviceWorker.ready;
        logPwa("service worker ready", {
          active: Boolean(reg.active),
        });
        if (navigator.serviceWorker.controller) {
          logPwa("service worker controlling");
        } else {
          navigator.serviceWorker.addEventListener(
            "controllerchange",
            () => logPwa("service worker controlling"),
            { once: true }
          );
        }
        window.dispatchEvent(new Event(PWA_EVENT_SW_READY));
        return reg;
      } catch (error) {
        console.warn("[PWA] service worker registration failed", error);
        return null;
      }
    })();
  }

  return registerPromise;
}

export function waitForServiceWorkerReady(): Promise<boolean> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve(false);
  }
  return registerServiceWorker().then((reg) => Boolean(reg));
}
