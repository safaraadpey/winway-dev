"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import styles from "./MyActiveGames.module.css";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import playPng from "../src/assets/logo/play.png";
import hourglassPng from "../src/assets/logo/hourglass.png";

/**
 * کامپوننت نمایش روم‌های فعال پلیر
 * نمایش chip های قابل کلیک برای دسترسی سریع به روم‌های لایو
 */
export default function MyActiveGames() {
  const router = useRouter();
  const { rooms, loading, error } = useActiveGamesContext();

  // اگر هیچ میز فعالی وجود ندارد، کامپوننت را اصلاً رندر نکن
  // (مطابق UX: در نبود بازی فعال، چیپ‌ها نمایش داده نشوند)
  if (!loading && !error && rooms.length === 0) {
    return null;
  }

  const handleRoomClick = (roomId: string) => {
    router.push(`/player/gameroom?roomId=${roomId}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "live":
      case "playing":
        return (
          <Image
            src={playPng}
            className={styles.playIcon}
            alt="play"
            width={24}
            height={24}
            priority={false}
          />
        );
      case "waiting":
        return (
          <Image
            src={hourglassPng}
            className={styles.waitingIcon}
            alt="waiting"
            width={16}
            height={16}
            priority={false}
          />
        );
      case "settling":
        return (
          <svg
            className={styles.settlingIcon}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        );
      default:
        return null;
    }
  };

  const formatPrice = (price: number): string => {
    return price.toLocaleString("en-US");
  };

  const getDisplayText = (room: { roomCode: string | null; cardPrice: number }): string => {
    return room.roomCode || formatPrice(room.cardPrice);
  };

  const isTournament = (room: { roomType?: string }): boolean => {
    return room.roomType === "tournament";
  };

  return (
    <div className={styles.container}>
      <div className={styles.chipsContainer}>
        {loading ? (
          <div className={styles.emptyState}>در حال بارگذاری...</div>
        ) : error ? (
          <div className={styles.emptyState}>خطا در دریافت میزهای فعال</div>
        ) : (
          rooms.map((room) => (
            <button
              key={room.roomId}
              className={styles.chip}
              onClick={() => handleRoomClick(room.roomId)}
              aria-label={`رفتن به روم ${getDisplayText(room)}`}
            >
              {isTournament(room) && (
                <svg
                  className={styles.trophyIcon}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
                </svg>
              )}
              <span className={styles.chipText}>{getDisplayText(room)}</span>
              {getStatusIcon(room.status)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

