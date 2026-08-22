"use client";

import { useState } from "react";
import styles from "./InstallAppButton.module.css";
import { useInstallPrompt } from "@/lib/contexts/InstallPromptContext";

interface InstallAppButtonProps {
  label?: string;
}

const INSTALLED_MESSAGE =
  "اپلیکیشن با موفقیت داخل گوشی شما نصب شده و می‌توانید برای تجربه بهتر از آن استفاده کنید.";

export default function InstallAppButton({
  label = "نصب دسترسی سریع(وب اپ)",
}: InstallAppButtonProps) {
  const {
    isStandalone,
    isPwaInstalledOnDevice,
    installUiState,
    canInstallDirectly,
    requestInstall,
  } = useInstallPrompt();
  const [showInstalledModal, setShowInstalledModal] = useState(false);

  // Hide only when opened from the installed app icon (standalone PWA).
  if (isStandalone) return null;

  const checking = installUiState === "checking";

  const handleInstallClick = async () => {
    if (isPwaInstalledOnDevice && !canInstallDirectly) {
      setShowInstalledModal(true);
      return;
    }

    if (!canInstallDirectly) return;

    const result = await requestInstall();
    if (result === "accepted") {
      setShowInstalledModal(true);
    }
  };

  return (
    <>
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.button}
          data-tour-id="install-app"
          disabled={checking}
          aria-busy={checking}
          onClick={() => void handleInstallClick()}
        >
          {checking ? "در حال بررسی نصب…" : label}
        </button>
      </div>

      {showInstalledModal ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={() => setShowInstalledModal(false)}
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-app-success-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              id="install-app-success-title"
              className={styles.modalTitle}
            >
              نصب موفق
            </h3>
            <p className={styles.modalMessage}>{INSTALLED_MESSAGE}</p>
            <button
              type="button"
              className={styles.installedModalButton}
              onClick={() => setShowInstalledModal(false)}
            >
              متوجه شدم
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
