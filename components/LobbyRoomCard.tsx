"use client";

import React from 'react';
import Image from 'next/image';
import styles from './LobbyRoomCard.module.css';

// Import room images
import room5 from '@/src/assets/room/5.png';
import room6 from '@/src/assets/room/6.png';
import room8 from '@/src/assets/room/8.png';
import room10 from '@/src/assets/room/10.png';
import room11 from '@/src/assets/room/11.png';
import room20 from '@/src/assets/room/20.png';
import room21 from '@/src/assets/room/21.png';

const LOBBY_ROOM_IMAGES = [
  room5,
  room6,
  room8,
  room10,
  room11,
  room20,
  room21,
] as const;

function getRoomImageByListIndex(listIndex: number) {
  if (listIndex <= 0) return LOBBY_ROOM_IMAGES[0];
  if (listIndex >= LOBBY_ROOM_IMAGES.length) {
    return LOBBY_ROOM_IMAGES[LOBBY_ROOM_IMAGES.length - 1];
  }
  return LOBBY_ROOM_IMAGES[listIndex];
}

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
  templateId?: string | null;
  entryRoomId?: string | null;
  /** ترتیب کارت در لیست لابی (۰ = اولین، برای انتخاب تصویر پس‌زمینه) */
  listIndex?: number;
  variant?: LobbyRoomCardVariant; // حالت نمایش: minimal (فقط عکس) یا expanded (همه اطلاعات)
  onClick?: (price: number, templateId?: string | null, entryRoomId?: string | null) => void;
  dataTourId?: string;
  statsDataTourId?: string;
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
  templateId,
  entryRoomId,
  listIndex = 0,
  variant = 'minimal', // حالت پیش‌فرض: minimal
  onClick,
  dataTourId,
  statsDataTourId,
}: LobbyRoomCardProps) {
  const formatPrice = (price: number) => {
  return new Intl.NumberFormat('en-US').format(price);
  };

  const handleClick = () => {
    if (onClick) {
      onClick(price, templateId, entryRoomId);
    }
  };

  const isExpanded = variant === 'expanded';
  const displayRoomName = roomName?.trim() || null;

  return (
    <div
      className={`${styles.roomCard} ${isExpanded ? styles.expanded : styles.minimal}`}
      data-tour-id={dataTourId}
      data-entry-room-id={entryRoomId ?? undefined}
      data-template-id={templateId ?? undefined}
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
          src={getRoomImageByListIndex(listIndex)}
          alt={`روم ${formatPrice(price)} تومان`}
          className={styles.roomImage}
          fill
          sizes="(max-width: 640px) 100vw, 600px"
          priority
        />
        <div className={styles.topBadges} data-tour-id={statsDataTourId}>
          <div className={styles.playersBadge}>
            <svg
              className={styles.badgeIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
            <span className={styles.badgeCount}>{players}</span>
          </div>
          <div className={styles.tablesBadge}>
            <svg
              className={styles.badgeIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
            </svg>
            <span className={styles.badgeCount}>{playingRooms}</span>
          </div>
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

