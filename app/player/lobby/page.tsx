"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import LobbyInfo from '@/components/LobbyInfo';
import LobbyRoomCard from '@/components/LobbyRoomCard';
import toast from 'react-hot-toast';
import styles from './lobby.module.css';
import { supabase } from "@/lib/supabaseClient";

interface RoomPriceGroup {
  price: number;
  currency: string;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  players: number;
  waitingPlayers: number;
  playingPlayers: number;
  templateId?: string;
}

/**
 * صفحه لابی - نمایش روم‌های بازی بر اساس قیمت تیکت
 */
export default function LobbyPage() {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [roomGroups, setRoomGroups] = useState<RoomPriceGroup[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlinePlayersCount, setOnlinePlayersCount] = useState<number>(0);

  // فعال کردن دکمه back در header
  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      router.push('/player/home');
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    async function fetchRooms() {
      let nextError: string | null = null;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;

        const res = await fetch("/api/player/lobby-room-groups", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });

        if (!res.ok) {
          console.error("fetchRooms: lobby-room-groups failed", res.status);
          nextError = "خطا در دریافت اطلاعات لابی";
          setRoomGroups([]);
          return;
        }

        const json = (await res.json()) as { groups: RoomPriceGroup[] };
        const groups = Array.isArray(json?.groups) ? json.groups : [];
        setRoomGroups(groups.sort((a, b) => a.price - b.price));

        // Fetch online players count (presence)
        const onlineRes = await fetch("/api/player/lobby-online-count", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (onlineRes.ok) {
          const onlineJson = (await onlineRes.json()) as { onlinePlayers: number };
          setOnlinePlayersCount(Number(onlineJson?.onlinePlayers ?? 0) || 0);
        } else {
          console.warn("fetchRooms: lobby-online-count failed", onlineRes.status);
        }
      } catch (error) {
        console.error('Error in fetchRooms:', error);
        setRoomGroups([]);
        nextError = 'خطای غیرمنتظره در بارگذاری لابی';
      } finally {
        setErrorMessage(nextError);
        setLoading(false);
      }
    }

    fetchRooms();
    
    // به‌روزرسانی هر 10 ثانیه
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, []);

  // Presence ping: update last_seen_at periodically while user is on lobby
  useEffect(() => {
    let stopped = false;
    let interval: any = null;

    async function ping() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        if (!token) return;
        await fetch("/api/me/ping-presence", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        // silent - we don't want to spam UI
      }
    }

    void ping();
    interval = setInterval(() => {
      if (!stopped) void ping();
    }, 60000);

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
    };
  }, []);

  // تابع برای کلیک روی روم
  const handleRoomClick = async (price: number, templateId?: string) => {
    if (!templateId) {
      console.error('Template ID is required');
      return;
    }

    try {
      // فقط به صفحه گیم‌روم بر اساس تمپلیت هدایت می‌کنیم
      router.push(`/player/gameroom?templateId=${templateId}`);
    } catch (error: any) {
      console.error('Error in handleRoomClick:', error);
      toast.error(error.message || 'خطا در ورود به اتاق');
    }
  };

  if (loading) {
    return (
      <div className={styles.lobbyContainer}>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p className={styles.loadingText}>در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.lobbyContainer}>
      {/* اطلاعات لابی */}
      <div className={styles.lobbyHeader}>
        <LobbyInfo 
          activePlayersCount={roomGroups.reduce((sum, group) => sum + group.players, 0)}
          onlinePlayersCount={onlinePlayersCount}
        />
      </div>
      {errorMessage && (
        <div className={styles.errorMessage}>
          {errorMessage}
        </div>
      )}

      {/* لیست روم‌ها */}
      <div className={styles.roomsList}>
        {roomGroups.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>هیچ روم فعالی وجود ندارد</p>
          </div>
        ) : (
          roomGroups.map((group) => (
            <LobbyRoomCard
              key={`${group.price}_${group.currency}`}
              price={group.price}
              currency={group.currency}
              waitingRooms={group.waitingRooms}
              playingRooms={group.playingRooms}
              totalRooms={group.totalRooms}
              players={group.players}
              waitingPlayers={group.waitingPlayers}
              playingPlayers={group.playingPlayers}
              templateId={group.templateId}
              variant="minimal" // TODO: از تنظیمات ادمین بگیرید
              onClick={handleRoomClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

