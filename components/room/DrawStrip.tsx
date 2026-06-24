import styles from "./DrawStrip.module.css";
import { useEffect, useRef, useState } from "react";

interface DrawStripProps {
  roomName?: string;
  showRoomBadge?: boolean;
  commitHash?: string | null;
  currentNumber: number | null;
  history: number[];
  /** مجموع اعداد قرعه‌کشی‌شده (برای نمایش 90/x) */
  totalDraws?: number;
  /** اگر currentNumber هنوز نداریم، می‌توانیم شمارش‌معکوس تا اولین draw را اینجا نمایش دهیم */
  countdownSeconds?: number | null;
  /** عدد قرعه‌ای که برندهٔ پر روی آن مشخص شده (از fullWinners.drawNumber) */
  winningFullDrawNumber?: number | null;
}

export default function DrawStrip({
  roomName,
  showRoomBadge = true,
  commitHash = null,
  currentNumber,
  history,
  totalDraws,
  countdownSeconds,
  winningFullDrawNumber = null,
}: DrawStripProps) {
  const [copyToast, setCopyToast] = useState<null | "success" | "error">(null);
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showCopyToast = (status: "success" | "error") => {
    setCopyToast(status);
    if (copyToastTimerRef.current) {
      clearTimeout(copyToastTimerRef.current);
      copyToastTimerRef.current = null;
    }
    copyToastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      copyToastTimerRef.current = null;
    }, 1500);
  };

  const drawsCount = totalDraws ?? (history.length + (currentNumber ? 1 : 0));
  const display =
    currentNumber != null
      ? String(currentNumber)
      : countdownSeconds != null && countdownSeconds >= 0
        ? String(countdownSeconds)
        : "-";

  const commitShort =
    typeof commitHash === "string" && commitHash.length >= 8
      ? `${commitHash.slice(0, 4)}...${commitHash.slice(-4)}`
      : commitHash;

  const copyCommit = async () => {
    if (!commitHash) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(String(commitHash));
      copied = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = String(commitHash);
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        copied = true;
      } catch {
        // ignore
      }
    }

    showCopyToast(copied ? "success" : "error");
  };

  const [isFlashing, setIsFlashing] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // هر بار مقدار نمایش‌داده‌شده عوض شد (شمارش‌معکوس یا عدد قرعه)، پالس بزرگ‌شدن اجرا شود
    setIsFlashing(true);

    if (flashTimerRef.current) {
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    }

    flashTimerRef.current = setTimeout(() => {
      setIsFlashing(false);
      flashTimerRef.current = null;
    }, 340);

    return () => {
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    };
  }, [display]);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current) {
        clearTimeout(copyToastTimerRef.current);
        copyToastTimerRef.current = null;
      }
    };
  }, []);

  const showWaitingRing =
    currentNumber != null ||
    (countdownSeconds != null && countdownSeconds >= 0);

  const isWinningFullDraw =
    currentNumber != null &&
    winningFullDrawNumber != null &&
    winningFullDrawNumber > 0 &&
    currentNumber === winningFullDrawNumber;

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        {roomName && showRoomBadge && (
          <span className={styles.roomBadge}>
            <span className={`${styles.roomBadgeValue} numeric-text numeric-text--11`}>{roomName}</span>
            <span className={styles.roomBadgeLabel}>شماره میز</span>
          </span>
        )}
        <span className={`${styles.badge} numeric-text numeric-text--11`}>90/{drawsCount}</span>
        {roomName && commitShort && (
          <span className={styles.commitRow}>
            {copyToast && (
              <span
                role="status"
                aria-live="polite"
                className={`${styles.copyToast} ${
                  copyToast === "success" ? styles.copyToastSuccess : styles.copyToastError
                }`}
              >
                {copyToast === "success" ? "کپی شد" : "خطا در کپی"}
              </span>
            )}
            <span className={styles.commitText}>
              <span dir="ltr" className="numeric-text numeric-text--12">
                {roomName}
              </span>{" "}
              <span className={styles.commitCodeLabel}>کد</span>
            </span>
            <button type="button" onClick={copyCommit} className={styles.copyButton}>
              کپی هش
            </button>
          </span>
        )}
      </div>
      <div
        className={`${styles.currentWrapper} ${isFlashing ? styles.revealPulse : ""}`}
      >
        {showWaitingRing && (
          <div className={styles.currentRing} aria-hidden="true">
            <span className={`${styles.currentRingLine} ${styles.currentRingLine1}`}>
              <span className={styles.currentRingLineInner} />
            </span>
            <span className={`${styles.currentRingLine} ${styles.currentRingLine2}`}>
              <span className={styles.currentRingLineInner} />
            </span>
            <span className={`${styles.currentRingLine} ${styles.currentRingLine3}`}>
              <span className={styles.currentRingLineInner} />
            </span>
          </div>
        )}
        <div
          className={`${styles.current} ${isWinningFullDraw ? styles.currentWinning : ""} numeric-text numeric-text--32`}
        >
          {display}
        </div>
      </div>
      <div className={styles.historyWrapper}>
        <div className={styles.history}>
          {history.length === 0 && (
            <span className={styles.empty}>هنوز عدد قبلی ندارد</span>
          )}
          {history.map((n, idx) => (
            <div key={`${n}-${idx}`} className={styles.historyItem}>
              {n}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
