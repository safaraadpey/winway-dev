"use client";

import styles from "./InstallAppButton.module.css";
import { useInstallPrompt } from "@/lib/contexts/InstallPromptContext";

interface InstallAppButtonProps {
  label?: string;
}

export default function InstallAppButton({
  label = "نصب اپلیکیشن",
}: InstallAppButtonProps) {
  const { isInstalled, installUiState, canInstallDirectly, requestInstall } =
    useInstallPrompt();

  if (isInstalled) return null;

  if (installUiState === "not_installable") {
    return null;
  }

  const checking = installUiState === "checking";

  const handleInstallClick = async () => {
    if (!canInstallDirectly) return;
    await requestInstall();
  };

  return (
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
  );
}
