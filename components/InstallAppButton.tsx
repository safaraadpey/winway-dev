"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import styles from "./InstallAppButton.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallAppButtonProps {
  label?: string;
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isAndroidDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent);
}

function isRunningStandalone() {
  if (typeof window === "undefined") return false;
  const iosStandalone =
    typeof (navigator as Navigator & { standalone?: boolean }).standalone === "boolean" &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayModeStandalone;
}

export default function InstallAppButton({ label = "نصب اپلیکیشن" }: InstallAppButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  const ios = useMemo(() => isIosDevice(), []);
  const android = useMemo(() => isAndroidDevice(), []);

  useEffect(() => {
    setInstalled(isRunningStandalone());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }

    if (ios) {
      setShowIosHelp((prev) => !prev);
      return;
    }

    if (android) {
      // Chrome emits beforeinstallprompt asynchronously; avoid showing install steps.
      toast("چند لحظه دیگر دوباره روی نصب بزنید");
    }
  };

  if (installed) return null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={handleInstallClick}>
        {label}
      </button>
      {ios && showIosHelp && (
        <p className={styles.helpText}>
          راهنمای نصب در آیفون:
          <br />
          Safari &gt; Share &gt; Add to Home Screen
        </p>
      )}
    </div>
  );
}
