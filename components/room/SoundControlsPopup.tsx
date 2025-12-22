"use client";

import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./SoundControlsPopup.module.css";
import {
  ensureUnlocked,
  getVolume as getNumberVolume,
  isMuted as isNumberMuted,
  setMuted as setNumberMuted,
  setVolume as setNumberVolume,
} from "@/lib/number-audio";
import {
  getMusicVolume,
  isDingEnabled,
  setDingEnabled,
  setMusicVolume,
} from "@/lib/audio-settings";

type Props = {
  open: boolean;
  onClose: () => void;
  anchorRef?: RefObject<HTMLElement>;
  onSettingsChange?: (next: {
    musicVolume: number;
    numbersVolume: number;
    numbersMuted: boolean;
    dingEnabled: boolean;
  }) => void;
};

function pct(v01: number) {
  return Math.round(Math.max(0, Math.min(1, v01)) * 100);
}

export default function SoundControlsPopup({ open, onClose, anchorRef, onSettingsChange }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const [musicVol, setMusicVolState] = useState<number>(1);
  const [numbersVol, setNumbersVolState] = useState<number>(1);
  const [numbersMuted, setNumbersMutedState] = useState<boolean>(false);
  const [dingEnabled, setDingEnabledState] = useState<boolean>(true);

  const overallMuted = useMemo(() => {
    const musicMuted = musicVol <= 0.001;
    return musicMuted && numbersMuted && !dingEnabled;
  }, [musicVol, numbersMuted, dingEnabled]);

  useEffect(() => {
    if (!open) return;

    // Load persisted settings when popup opens
    const mv = getMusicVolume();
    const nv = getNumberVolume();
    const nm = isNumberMuted();
    const de = isDingEnabled();

    setMusicVolState(mv);
    setNumbersVolState(nv);
    setNumbersMutedState(nm);
    setDingEnabledState(de);

    onSettingsChange?.({
      musicVolume: mv,
      numbersVolume: nv,
      numbersMuted: nm,
      dingEnabled: de,
    });
  }, [open, onSettingsChange]);

  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;

    const updatePosition = () => {
      const anchor = anchorRef?.current ?? null;
      if (!anchor) {
        // fallback: top-right of viewport
        setPos({ top: 12, left: Math.max(12, window.innerWidth - 280 - 12) });
        return;
      }

      const rect = anchor.getBoundingClientRect();
      const width = 280;
      const margin = 12;
      const top = Math.min(window.innerHeight - margin - 20, rect.bottom + 8);
      const desiredLeft = rect.right - width;
      const left = Math.max(margin, Math.min(desiredLeft, window.innerWidth - width - margin));
      setPos({ top, left });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (root.contains(e.target as Node)) return;
      const anchor = anchorRef?.current ?? null;
      if (anchor && anchor.contains(e.target as Node)) return;
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const unlock = () => {
    // Called from user interaction handlers
    void ensureUnlocked().catch(() => {});
  };

  const style = pos
    ? ({ position: "fixed", top: pos.top, left: pos.left } as const)
    : ({ position: "fixed", top: 12, left: 12 } as const);

  return createPortal(
    <div
      ref={rootRef}
      className={styles.popup}
      style={style}
      role="dialog"
      aria-label="Sound controls"
    >
      <div className={styles.title}>
        تنظیمات صدا {overallMuted ? "(خاموش)" : ""}
      </div>

      {/* Music */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>موزیک</div>
          <div className={styles.value}>{pct(musicVol)}%</div>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={pct(musicVol)}
          onPointerDown={unlock}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setMusicVolState(v);
            setMusicVolume(v);
            onSettingsChange?.({
              musicVolume: v,
              numbersVolume: numbersVol,
              numbersMuted,
              dingEnabled,
            });
          }}
          aria-label="Music volume"
        />
        <div className={styles.hint}>
          اگر موزیک در بازی فعال باشد، از همین مقدار استفاده می‌کند.
        </div>
      </div>

      {/* Numbers */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>شماره‌ها</div>
          <button
            type="button"
            className={`${styles.toggle} ${numbersMuted ? styles.toggleOff : ""}`}
            onPointerDown={unlock}
            onClick={() => {
              const next = !numbersMuted;
              setNumbersMutedState(next);
              setNumberMuted(next);
              onSettingsChange?.({
                musicVolume: musicVol,
                numbersVolume: numbersVol,
                numbersMuted: next,
                dingEnabled,
              });
            }}
            aria-label="Toggle numbers mute"
          >
            {numbersMuted ? "Mute" : "On"}
          </button>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={pct(numbersVol)}
          onPointerDown={unlock}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setNumbersVolState(v);
            setNumberVolume(v);
            onSettingsChange?.({
              musicVolume: musicVol,
              numbersVolume: v,
              numbersMuted,
              dingEnabled,
            });
          }}
          aria-label="Numbers volume"
        />
        <div className={styles.hint}>حجم صدای اعلام شماره‌ها</div>
      </div>

      {/* Ding */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>دینگ</div>
          <button
            type="button"
            className={`${styles.toggle} ${!dingEnabled ? styles.toggleOff : ""}`}
            onClick={() => {
              const next = !dingEnabled;
              setDingEnabledState(next);
              setDingEnabled(next);
              onSettingsChange?.({
                musicVolume: musicVol,
                numbersVolume: numbersVol,
                numbersMuted,
                dingEnabled: next,
              });
            }}
            aria-label="Toggle ding sound"
          >
            {dingEnabled ? "On" : "Off"}
          </button>
        </div>
        <div className={styles.hint}>
          صدای دینگ هنگام افزایش موجودی Ding پخش می‌شود.
        </div>
      </div>
    </div>,
    document.body
  );
}


