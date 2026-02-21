"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./InstallAppButton.module.css";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
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

interface InstallAppButtonProps {
  label?: string;
}

export default function InstallAppButton({ label = "نصب اپلیکیشن" }: InstallAppButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [showAndroidHelp, setShowAndroidHelp] = useState(false);

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
      setShowAndroidHelp(false);
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
      setShowAndroidHelp(false);
      setShowIosHelp((prev) => !prev);
      return;
    }

    if (android) {
      setShowIosHelp(false);
      setShowAndroidHelp((prev) => !prev);
    }
  };

  if (installed) return null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={handleInstallClick}>
        {label}
      </button>
      {ios && showIosHelp && (
        <p className={styles.helpText}>برای نصب در آیفون: Safari &gt; Share &gt; Add to Home Screen</p>
      )}
      {android && showAndroidHelp && (
        <p className={styles.helpText}>
          اگر پنجره نصب باز نشد: در Chrome روی منوی سه‌نقطه بزنید و گزینه Install app یا Add to Home screen را انتخاب کنید.
        </p>
      )}
    </div>
  );
}
