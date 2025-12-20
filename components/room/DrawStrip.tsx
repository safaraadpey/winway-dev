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
}

export default function DrawStrip({
  roomName,
  showRoomBadge = true,
  commitHash = null,
  currentNumber,
  history,
  totalDraws,
  countdownSeconds,
}: DrawStripProps) {
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
    try {
      await navigator.clipboard.writeText(String(commitHash));
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
      } catch {
        // ignore
      }
    }
  };

  const [isFlashing, setIsFlashing] = useState(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // هر بار مقدار نمایش‌داده‌شده عوض شد (شمارش‌معکوس یا عدد قرعه)، افکت flash اجرا شود
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

  return (
    <div className={styles.container}>
      <div className={styles.labelRow}>
        {roomName && showRoomBadge && (
          <span className={styles.roomBadge}>
            <span className={`${styles.roomBadgeValue} latin-number`}>{roomName}</span>
            <span className={styles.roomBadgeLabel}>شماره میز</span>
          </span>
        )}
        <span className={`${styles.badge} latin-number`}>90/{drawsCount}</span>
        {roomName && commitShort && (
          <span className="inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-[rgba(101,79,150,1)] bg-black/40 pl-[6px] pr-[2px] py-[2px] text-[12px] text-white/90">
            <span className="whitespace-nowrap">
              <span dir="ltr" className="latin-number">
                {roomName}
              </span>{" "}
              <span className="text-white/70">کد</span>
            </span>
            <span className="text-white/70 whitespace-nowrap">CMT</span>
            <span dir="ltr" className="latin-number">
              {commitShort}
            </span>
            <button
              type="button"
              onClick={copyCommit}
              className="rounded-full border border-[#22c55e] bg-[#22c55e] px-2 py-[2px] text-[11px] text-white font-semibold active:opacity-80"
            >
              کپی
            </button>
          </span>
        )}
      </div>
      <div
        className={`${styles.current} ${isFlashing ? styles.flash : ""} latin-number`}
      >
        {display}
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
