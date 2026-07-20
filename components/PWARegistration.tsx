"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/registerServiceWorker";

/**
 * Ensures SW registration in development (production uses head bootstrap).
 */
export default function PWARegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!("serviceWorker" in navigator)) return;
    void registerServiceWorker();
  }, []);

  return null;
}
