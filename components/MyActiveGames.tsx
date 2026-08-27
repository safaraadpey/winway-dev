"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import styles from "./MyActiveGames.module.css";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import { useTheme } from "@/lib/contexts/ThemeContext";
import { getActiveGameIconPath } from "@/lib/theme/activeGameIconFiles";
import {
  buildMyActiveGameRoomHref,
  dispatchMyActiveGameChip,
  isLiveActiveGameStatus,
} from "@/lib/activeGames/myActiveGameNavigation";

/**
 * کامپوننت نمایش روم‌های فعال پلیر
 * نمایش chip های قابل کلیک برای دسترسی سریع به روم‌های لایو
 */
export default function MyActiveGames() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { rooms, loading, error, invalidate } = useActiveGamesContext();
  const { themeId } = useTheme();

  const isOnGameScreen =
    pathname.startsWith("/player/gameroom") ||
    /^\/player\/tournaments\/[^/]+/.test(pathname);
  const currentRoomId = isOnGameScreen
    ? searchParams.get("roomId")
    : null;

  // اگر هیچ میز فعالی وجود ندارد، کامپوننت را اصلاً رندر نکن
  // (مطابق UX: در نبود بازی فعال، چیپ‌ها نمایش داده نشوند)
  if (!loading && !error && rooms.length === 0) {
    return null;
  }

  const handleRoomClick = (room: (typeof rooms)[number]) => {
    const href = buildMyActiveGameRoomHref(room.roomId, room.status);
    const live = isLiveActiveGameStatus(room.status);

    if (isOnGameScreen && currentRoomId === room.roomId) {
      if (live) {
        console.info("[MyActiveGames] Re-enter live for current room", {
          roomId: room.roomId,
          status: room.status,
        });
        dispatchMyActiveGameChip({ roomId: room.roomId, status: room.status });
      }
      return;
    }

    console.info("[MyActiveGames] Navigate to active room", {
      roomId: room.roomId,
      status: room.status,
      enterLive: live,
    });
    router.push(href);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "live":
      case "playing":
        return (
          <Image
            src={getActiveGameIconPath(themeId, "play")}
            className={styles.playIcon}
            alt="play"
            width={21}
            height={21}
            priority={false}
          />
        );
      case "waiting":
        return (
          <Image
            src={getActiveGameIconPath(themeId, "waiting")}
            className={styles.waitingIcon}
            alt="waiting"
            width={14}
            height={14}
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

  const getPriceInThousands = (cardPrice: number): number => {
    return Math.trunc(Number(cardPrice || 0) / 1000);
  };

  const getTemplateTableIndex = (
    room: { roomId: string; templateId?: string | null; templateTableIndex?: number; cardPrice: number },
    allRooms: typeof rooms
  ): number => {
    if (room.templateTableIndex && room.templateTableIndex > 0) {
      return room.templateTableIndex;
    }
    const key = room.templateId || `__price:${room.cardPrice}`;
    const siblings = allRooms
      .filter((r) => (r.templateId || `__price:${r.cardPrice}`) === key)
      .sort((a, b) => a.roomId.localeCompare(b.roomId));
    const idx = siblings.findIndex((r) => r.roomId === room.roomId);
    return idx >= 0 ? idx + 1 : 1;
  };

  const getDisplayText = (room: (typeof rooms)[number]): string => {
    if (isTournament(room)) {
      const roundNo = room.roundNo && room.roundNo > 0 ? room.roundNo : 1;
      return `تور / ${roundNo.toLocaleString("en-US")}`;
    }
    const priceK = getPriceInThousands(room.cardPrice);
    const tableIndex = getTemplateTableIndex(room, rooms);
    if (priceK > 0) {
      return `${priceK.toLocaleString("en-US")} هزار / ${tableIndex}`;
    }
    return `${formatPrice(room.cardPrice)} / ${tableIndex}`;
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
          <div className={styles.errorState}>
            <span className={styles.errorText}>خطا در دریافت میزها</span>
            <button
              type="button"
              className={styles.retryButton}
              onClick={() => invalidate?.()}
            >
              بروزرسانی دستی
            </button>
          </div>
        ) : (
          rooms.map((room) => {
            const isCurrentRoom = Boolean(
              currentRoomId && room.roomId === currentRoomId
            );
            const tournament = isTournament(room);
            const roundNo =
              tournament && room.roundNo && room.roundNo > 0 ? room.roundNo : 1;
            const priceK = getPriceInThousands(room.cardPrice);
            const tableIndex = getTemplateTableIndex(room, rooms);

            return (
            <button
              key={room.roomId}
              className={`${styles.chip}${isCurrentRoom ? ` ${styles.chipActive}` : ""}`}
              onClick={() => handleRoomClick(room)}
              aria-label={`رفتن به روم ${getDisplayText(room)}`}
              aria-current={isCurrentRoom ? "true" : undefined}
            >
              {tournament && (
                <svg
                  className={styles.trophyIcon}
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 0 0 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
                </svg>
              )}
              <span className={styles.chipText}>
                {tournament ? (
                  <>
                    <span className={styles.chipUnit}>تور</span>
                    <span className={styles.chipNum} dir="ltr">
                      /
                    </span>
                    <span className={styles.chipNum} dir="ltr">
                      {roundNo.toLocaleString("en-US")}
                    </span>
                  </>
                ) : (
                  <>
                    <span className={styles.chipPriceGroup}>
                      {priceK > 0 ? <span className={styles.chipUnit}>هزار</span> : null}
                      <span className={styles.chipNum} dir="ltr">
                        {priceK > 0 ? priceK.toLocaleString("en-US") : formatPrice(room.cardPrice)}
                      </span>
                    </span>
                    <span className={styles.chipNum} dir="ltr">
                      /
                    </span>
                    <span className={styles.chipNum} dir="ltr">
                      {tableIndex}
                    </span>
                  </>
                )}
              </span>
              {getStatusIcon(room.status)}
            </button>
            );
          })
        )}
      </div>
    </div>
  );
}

