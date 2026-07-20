"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./InstallAppButton.module.css";
import { useInstallPrompt } from "@/lib/contexts/InstallPromptContext";

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

export default function InstallAppButton({ label = "نصب اپلیکیشن" }: InstallAppButtonProps) {
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const { isInstalled, canInstallDirectly, requestInstall } = useInstallPrompt();

  const ios = useMemo(() => isIosDevice(), []);
  const android = useMemo(() => isAndroidDevice(), []);
  useEffect(() => {
    if (isInstalled) {
      setShowInstallGuideModal(false);
    }
  }, [isInstalled]);

  const handleInstallClick = async () => {
    if (canInstallDirectly) {
      await requestInstall();
      return;
    }

    setShowInstallGuideModal(true);
  };

  if (isInstalled) return null;

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        data-tour-id="install-app"
        onClick={handleInstallClick}
      >
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
