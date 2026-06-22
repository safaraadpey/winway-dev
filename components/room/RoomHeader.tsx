"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./RoomHeader.module.css";
import SoundControlsPopup from "./SoundControlsPopup";
import { getMusicVolume, isDingEnabled } from "@/lib/audio-settings";
import { getVolume as getNumberVolume, isMuted as isNumberMuted } from "@/lib/number-audio";

interface RoomHeaderProps {
  linePrize: number;
  fullPrize: number;
  isTournament?: boolean;
  tournamentName?: string | null;
  roundNumber?: number | null;
  /** وقتی برنده خط مشخص شده، بوردر چیپ خط طلایی می‌شود */
  hasLineWinner?: boolean;
  /** وقتی برنده پر مشخص شده، بوردر چیپ دبرنا طلایی می‌شود */
  hasFullWinner?: boolean;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value || 0);

export default function RoomHeader({
  linePrize,
  fullPrize,
  isTournament = false,
  tournamentName = null,
  roundNumber = null,
  hasLineWinner = false,
  hasFullWinner = false,
}: RoomHeaderProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement | null>(null);

  const [musicVol, setMusicVol] = useState(1);
  const [numbersVol, setNumbersVol] = useState(1);
  const [numbersMuted, setNumbersMuted] = useState(false);
  const [dingEnabled, setDingEnabledState] = useState(true);

  const refreshFromStorage = useCallback(() => {
    setMusicVol(getMusicVolume());
    setNumbersVol(getNumberVolume());
    setNumbersMuted(isNumberMuted());
    setDingEnabledState(isDingEnabled());
  }, []);

  useEffect(() => {
    refreshFromStorage();
  }, [refreshFromStorage]);

  // Best-effort sync if other tabs/windows update localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (
        e.key === "music_volume" ||
        e.key === "ding_sound_enabled" ||
        e.key === "number_audio_volume" ||
        e.key === "number_audio_muted"
      ) {
        refreshFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshFromStorage]);

  const overallMuted = useMemo(() => {
    const musicMuted = musicVol <= 0.001;
    return musicMuted && numbersMuted && !dingEnabled;
  }, [musicVol, numbersMuted, dingEnabled]);

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.muteButton}
        aria-label="sound settings"
        ref={anchorRef}
        onClick={() => {
          refreshFromStorage();
          setOpen((v) => !v);
        }}
      >
        {overallMuted ? "🔇" : "🔊"}
      </button>

      <SoundControlsPopup
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        onSettingsChange={(next) => {
          setMusicVol(next.musicVolume);
          setNumbersVol(next.numbersVolume);
          setNumbersMuted(next.numbersMuted);
          setDingEnabledState(next.dingEnabled);
        }}
      />
      <div className={styles.prizes}>
        {isTournament ? (
          <>
            <div className={`${styles.prizeChip} ${styles.tournamentChip}`}>
              <span className={styles.prizeValue}>
                {roundNumber != null ? `راند ${roundNumber}` : "راند -"}
              </span>
            </div>
            <div className={`${styles.prizeChip} ${styles.tournamentChip}`}>
              <span className={styles.prizeValue}>
                {tournamentName || "تورنومنت"}
              </span>
            </div>
          </>
        ) : (
          <>
            <div
              className={`${styles.prizeChip} ${styles.prizeChipLine} ${hasLineWinner ? styles.prizeChipLineWinner : ""}`}
            >
              <span className={`${styles.prizeValue} latin-number`}>
                {formatNumber(linePrize)}
              </span>
              <span className={styles.prizeLabel}>خط</span>
            </div>
            <div
              className={`${styles.prizeChip} ${styles.prizeChipFull} ${hasFullWinner ? styles.prizeChipLineWinner : ""}`}
            >
              <span className={`${styles.prizeValue} latin-number`}>
                {formatNumber(fullPrize)}
              </span>
              <span className={styles.prizeLabel}>دبرنا</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
