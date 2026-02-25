"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);

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
      setShowInstallGuideModal(false);
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

    setShowInstallGuideModal(true);
  };

  if (installed) return null;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.button} onClick={handleInstallClick}>
        {label}
      </button>
      {showInstallGuideModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            {ios ? (
              <p className={styles.helpText}>
                راهنمای نصب در آیفون:
                <br />
                Safari &gt; Share &gt; Add to Home Screen
              </p>
            ) : android ? (
              <p className={styles.helpText}>
                راهنمای نصب در اندروید:
                <br />
                Chrome &gt; سه‌نقطه &gt; Install app
              </p>
            ) : (
              <p className={styles.helpText}>
                برای نصب اپ، از گزینه نصب مرورگر استفاده کنید.
              </p>
            )}
            <button
              type="button"
              className={styles.confirmButton}
              onClick={() => setShowInstallGuideModal(false)}
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
