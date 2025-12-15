import styles from "./DrawStrip.module.css";
import { useEffect, useRef, useState } from "react";

interface DrawStripProps {
  currentNumber: number | null;
  history: number[];
  /** مجموع اعداد قرعه‌کشی‌شده (برای نمایش 90/x) */
  totalDraws?: number;
  /** اگر currentNumber هنوز نداریم، می‌توانیم شمارش‌معکوس تا اولین draw را اینجا نمایش دهیم */
  countdownSeconds?: number | null;
}

export default function DrawStrip({
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
        <span className={styles.label}>اعداد قبلی</span>
        <span className={`${styles.badge} latin-number`}>90/{drawsCount}</span>
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
