"use client";

import React from "react";
import { useRouter } from "next/navigation";
import styles from "./MyActiveGames.module.css";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";

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
          <svg
            className={styles.playIcon}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        );
      case "waiting":
        return (
          <svg
            className={styles.waitingIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
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
              <span className={styles.chipText}>{getDisplayText(room)}</span>
              {getStatusIcon(room.status)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

