"use client";

import { useEffect } from "react";
import {
  applySafeAreaInsets,
  measureSafeAreaInsets,
  syncPwaDisplayClasses,
} from "@/lib/pwa/safeArea";

export default function PwaSafeArea() {
  useEffect(() => {
    const update = () => {
      syncPwaDisplayClasses();
      applySafeAreaInsets(measureSafeAreaInsets());
    };

    update();

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return null;
}
