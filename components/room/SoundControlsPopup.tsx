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
  isMasterMuted,
  setMasterMuted,
  getPreviousMusicVolume,
  setPreviousMusicVolume,
  getPreviousNumbersMuted,
  setPreviousNumbersMuted,
  getPreviousDingEnabled,
  setPreviousDingEnabled,
} from "@/lib/audio-settings";
import { setMusicVolumeValue } from "@/lib/audio/music";

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
  const [musicMuted, setMusicMutedState] = useState<boolean>(false);
  const [previousMusicVol, setPreviousMusicVol] = useState<number>(0.15);
  const [numbersVol, setNumbersVolState] = useState<number>(1);
  const [numbersMuted, setNumbersMutedState] = useState<boolean>(false);
  const [dingEnabled, setDingEnabledState] = useState<boolean>(true);
  const [masterMuted, setMasterMutedState] = useState<boolean>(false);

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
    const mm = isMasterMuted();

    const musicIsMuted = mv <= 0.001;
    const prevMv = getPreviousMusicVolume();
    
    setMusicVolState(mv);
    setMusicMutedState(musicIsMuted);
    setPreviousMusicVol(prevMv !== null ? prevMv : (mv > 0.001 ? mv : 0.15));
    setNumbersVolState(nv);
    setNumbersMutedState(nm);
    setDingEnabledState(de);
    setMasterMutedState(mm);

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

      {/* Master Mute Toggle */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>خاموش کردن همه صداها</div>
          <button
            type="button"
            className={`${styles.toggle} ${masterMuted ? styles.toggleOff : ""}`}
            onClick={() => {
              const next = !masterMuted;
              setMasterMutedState(next);
              setMasterMuted(next);

              if (next) {
                // Save current settings before muting
                if (musicVol > 0.001) {
                  setPreviousMusicVolume(musicVol);
                }
                setPreviousNumbersMuted(numbersMuted);
                setPreviousDingEnabled(dingEnabled);

                // Mute everything
                setMusicVolState(0);
                setMusicVolume(0);
                setMusicVolumeValue(0);
                setMusicMutedState(true);
                setNumbersMutedState(true);
                setNumberMuted(true);
                setDingEnabledState(false);
                setDingEnabled(false);

                onSettingsChange?.({
                  musicVolume: 0,
                  numbersVolume: numbersVol,
                  numbersMuted: true,
                  dingEnabled: false,
                });
              } else {
                // Restore previous settings
                const prevMv = getPreviousMusicVolume();
                const prevNm = getPreviousNumbersMuted();
                const prevDe = getPreviousDingEnabled();

                const restoredMv = prevMv !== null ? prevMv : musicVol;
                const restoredNm = prevNm !== null ? prevNm : numbersMuted;
                const restoredDe = prevDe !== null ? prevDe : dingEnabled;

                setMusicVolState(restoredMv);
                setMusicVolume(restoredMv);
                setMusicVolumeValue(restoredMv);
                setMusicMutedState(restoredMv <= 0.001);
                setPreviousMusicVol(restoredMv > 0.001 ? restoredMv : 0.15);
                setNumbersMutedState(restoredNm);
                setNumberMuted(restoredNm);
                setDingEnabledState(restoredDe);
                setDingEnabled(restoredDe);

                onSettingsChange?.({
                  musicVolume: restoredMv,
                  numbersVolume: numbersVol,
                  numbersMuted: restoredNm,
                  dingEnabled: restoredDe,
                });
              }
            }}
            aria-label="Toggle master mute"
          >
            {masterMuted ? "خاموش" : "روشن"}
          </button>
        </div>
      </div>

      {/* Music */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>موزیک</div>
          <button
            type="button"
            className={`${styles.toggle} ${musicMuted ? styles.toggleOff : ""}`}
            disabled={masterMuted}
            onPointerDown={unlock}
            onClick={() => {
              const next = !musicMuted;
              setMusicMutedState(next);
              
              if (next) {
                // Mute: save current volume and set to 0
                if (musicVol > 0.001) {
                  setPreviousMusicVol(musicVol);
                  setPreviousMusicVolume(musicVol);
                }
                setMusicVolState(0);
                setMusicVolume(0);
                setMusicVolumeValue(0);
              } else {
                // Unmute: restore previous volume or use default
                const restoredVol = previousMusicVol > 0.001 ? previousMusicVol : 0.15;
                setMusicVolState(restoredVol);
                setMusicVolume(restoredVol);
                setMusicVolumeValue(restoredVol);
              }
              
              // If master muted and user unmutes music, disable master mute
              if (masterMuted && !next) {
                setMasterMutedState(false);
                setMasterMuted(false);
              }
              
              onSettingsChange?.({
                musicVolume: next ? 0 : (previousMusicVol > 0.001 ? previousMusicVol : 0.15),
                numbersVolume: numbersVol,
                numbersMuted,
                dingEnabled,
              });
            }}
            aria-label="Toggle music mute"
          >
            {musicMuted ? "خاموش" : "روشن"}
          </button>
        </div>
        <div className={styles.row}>
          <div className={styles.label}></div>
          <div className={styles.value}>{pct(musicVol)}%</div>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={pct(musicVol)}
          disabled={masterMuted}
          onPointerDown={unlock}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setMusicVolState(v);
            setMusicVolume(v);
            setMusicVolumeValue(v); // Update the actual music audio element
            
            // Update mute state based on volume
            if (v <= 0.001) {
              setMusicMutedState(true);
            } else {
              setMusicMutedState(false);
              setPreviousMusicVol(v);
              setPreviousMusicVolume(v);
            }
            
            // If master muted and user changes volume, disable master mute
            if (masterMuted && v > 0) {
              setMasterMutedState(false);
              setMasterMuted(false);
            }
            
            onSettingsChange?.({
              musicVolume: v,
              numbersVolume: numbersVol,
              numbersMuted,
              dingEnabled,
            });
          }}
          aria-label="Music volume"
        />
      </div>

      {/* Numbers */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>شماره‌ها</div>
          <button
            type="button"
            className={`${styles.toggle} ${numbersMuted ? styles.toggleOff : ""}`}
            disabled={masterMuted}
            onPointerDown={unlock}
            onClick={() => {
              const next = !numbersMuted;
              setNumbersMutedState(next);
              setNumberMuted(next);
              
              // If master muted and user unmutes numbers, disable master mute
              if (masterMuted && !next) {
                setMasterMutedState(false);
                setMasterMuted(false);
              }
              
              onSettingsChange?.({
                musicVolume: musicVol,
                numbersVolume: numbersVol,
                numbersMuted: next,
                dingEnabled,
              });
            }}
            aria-label="Toggle numbers mute"
          >
            {numbersMuted ? "خاموش" : "روشن"}
          </button>
        </div>
        <input
          className={styles.slider}
          type="range"
          min={0}
          max={100}
          value={pct(numbersVol)}
          disabled={masterMuted}
          onPointerDown={unlock}
          onChange={(e) => {
            const v = Number(e.target.value) / 100;
            setNumbersVolState(v);
            setNumberVolume(v);
            
            // If master muted and user changes volume, disable master mute
            if (masterMuted && v > 0 && !numbersMuted) {
              setMasterMutedState(false);
              setMasterMuted(false);
            }
            
            onSettingsChange?.({
              musicVolume: musicVol,
              numbersVolume: v,
              numbersMuted,
              dingEnabled,
            });
          }}
          aria-label="Numbers volume"
        />
      </div>

      {/* Ding */}
      <div className={styles.section}>
        <div className={styles.row}>
          <div className={styles.label}>دینگ</div>
          <button
            type="button"
            className={`${styles.toggle} ${!dingEnabled ? styles.toggleOff : ""}`}
            disabled={masterMuted}
            onClick={() => {
              const next = !dingEnabled;
              setDingEnabledState(next);
              setDingEnabled(next);
              
              // If master muted and user enables ding, disable master mute
              if (masterMuted && next) {
                setMasterMutedState(false);
                setMasterMuted(false);
              }
              
              onSettingsChange?.({
                musicVolume: musicVol,
                numbersVolume: numbersVol,
                numbersMuted,
                dingEnabled: next,
              });
            }}
            aria-label="Toggle ding sound"
          >
            {dingEnabled ? "روشن" : "خاموش"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}


