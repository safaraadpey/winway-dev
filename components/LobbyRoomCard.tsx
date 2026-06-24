"use client";

import React from 'react';
import Image from 'next/image';
import styles from './LobbyRoomCard.module.css';

// Import room images
import room5 from '@/src/assets/room/5.png';
import room10 from '@/src/assets/room/10.png';
import room20 from '@/src/assets/room/20.png';
import room50 from '@/src/assets/room/50.png';
import room100 from '@/src/assets/room/100.png';
import room200 from '@/src/assets/room/200.png';

export type LobbyRoomCardVariant = 'minimal' | 'expanded';

export interface LobbyRoomCardProps {
  price: number;
  currency: string;
  roomName?: string | null;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  players: number;
  waitingPlayers?: number;
  playingPlayers?: number;
  templateId?: string;
  entryRoomId?: string | null;
  variant?: LobbyRoomCardVariant; // حالت نمایش: minimal (فقط عکس) یا expanded (همه اطلاعات)
  onClick?: (price: number, templateId?: string, entryRoomId?: string | null) => void;
}

/**
 * کامپوننت نمایش کارت روم در لابی
 * 
 * @param variant - حالت نمایش: 'minimal' (فقط عکس) یا 'expanded' (همه اطلاعات)
 *                  پیش‌فرض: 'minimal'
 */
export default function LobbyRoomCard({
  price,
  currency,
  roomName,
  waitingRooms,
  playingRooms,
  totalRooms,
  players,
  waitingPlayers,
  playingPlayers,
  templateId,
  entryRoomId,
  variant = 'minimal', // حالت پیش‌فرض: minimal
  onClick
}: LobbyRoomCardProps) {
  // تابع برای دریافت عکس روم بر اساس قیمت
  const getRoomImage = (price: number) => {
    // تبدیل قیمت به هزار تومان برای تطبیق با نام فایل‌ها
    const priceInThousands = price / 1000;
    
    if (priceInThousands <= 5) return room5;
    if (priceInThousands <= 10) return room10;
    if (priceInThousands <= 20) return room20;
    if (priceInThousands <= 50) return room50;
    if (priceInThousands <= 100) return room100;
    return room200;
  };

  // تابع برای فرمت کردن قیمت
  const formatPrice = (price: number) => {
  return new Intl.NumberFormat('en-US').format(price);
  };

  const handleClick = () => {
    if (onClick) {
      onClick(price, templateId, entryRoomId);
    }
  };

  const isExpanded = variant === 'expanded';
  const hasPlayerBreakdown =
    Number.isFinite(waitingPlayers) && Number.isFinite(playingPlayers);
  const displayRoomName = roomName?.trim() || null;

  return (
    <div
      className={`${styles.roomCard} ${isExpanded ? styles.expanded : styles.minimal}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className={styles.roomImageContainer}>
        <Image
          src={getRoomImage(price)}
          alt={`روم ${formatPrice(price)} تومان`}
          className={styles.roomImage}
          fill={false}
          width={600}
          height={200}
          style={{ width: "100%", height: "auto" }}
          sizes="(max-width: 640px) 100vw, 600px"
          priority
        />
        {/* نمایش تعداد بازیکنان با آیکون */}
        <div className={styles.playersBadge}>
          <svg
            className={styles.playerIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <span className={styles.playersCount}>
            {hasPlayerBreakdown
              ? `${Number(waitingPlayers)}/${Number(playingPlayers)}`
              : players}
          </span>
        </div>
        {/* قیمت و نام اتاق — پایین سمت راست */}
        {!isExpanded && (
          <div className={styles.priceStack}>
            <div className={styles.priceBadge}>
              <span className={styles.priceCount}>{formatPrice(price)}</span>
            </div>
            {displayRoomName ? (
              <div className={styles.roomNameBadge}>
                <span className={styles.roomNameText}>{displayRoomName}</span>
              </div>
            ) : (
              <div className={styles.roomNameSpacer} aria-hidden="true" />
            )}
          </div>
        )}
      </div>
      
      {/* نمایش اطلاعات کامل فقط در حالت expanded */}
      {isExpanded && (
        <div className={styles.roomInfo}>
          <div className={styles.roomPrice}>
            {formatPrice(price)} تومان
          </div>
          {displayRoomName ? (
            <div className={styles.roomNameExpanded}>{displayRoomName}</div>
          ) : null}
          <div className={styles.roomStats}>
            <span className={styles.statItem}>
              <span className={styles.statLabel}>اتاق‌ها:</span>
              <span className={styles.statValue}>{totalRooms}</span>
            </span>
            <span className={styles.statItem}>
              <span className={styles.statLabel}>بازیکنان:</span>
              <span className={styles.statValue}>{players}</span>
            </span>
          </div>
          <div className={styles.roomStatus}>
            {playingRooms > 0 && (
              <span className={`${styles.statusBadge} ${styles.playing}`}>
                در حال بازی: {playingRooms}
              </span>
            )}
            {waitingRooms > 0 && (
              <span className={`${styles.statusBadge} ${styles.waiting}`}>
                در انتظار: {waitingRooms}
              </span>
            )}
            {totalRooms === 0 && (
              <span className={`${styles.statusBadge} ${styles.unavailable}`}>
                در دسترس نیست
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

