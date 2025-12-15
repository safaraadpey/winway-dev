"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import styles from './LobbyInfo.module.css';

interface LobbyInfoProps {
  className?: string;
  /** تعداد بازیکنان فعال (از مجموع بازیکنان همه روم‌ها) */
  activePlayersCount?: number;
  /** تعداد پلیرهای آنلاین (از presence view) - اگر داده شود، query مستقیم انجام نمی‌شود */
  onlinePlayersCount?: number;
}

/**
 * کامپوننت نمایش اطلاعات لابی
 * نمایش تعداد پلیرهای اکتیو و آنلاین
 * 
 * @param activePlayersCount - تعداد بازیکنان فعال از مجموع بازیکنان همه روم‌ها (اختیاری)
 *                             اگر ارائه شود، از این مقدار استفاده می‌شود
 */
export default function LobbyInfo({ className, activePlayersCount, onlinePlayersCount }: LobbyInfoProps) {
  const [activePlayers, setActivePlayers] = useState<number>(0);
  const [onlinePlayers, setOnlinePlayers] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLobbyStats() {
      try {
        // اگر activePlayersCount از props ارائه شده باشد، از آن استفاده می‌کنیم
        if (activePlayersCount !== undefined) {
          setActivePlayers(activePlayersCount);
        } else {
          // در غیر این صورت، از query مستقیم استفاده می‌کنیم (fallback)
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
          
          // active players: distinct player_user_id با تیکت‌های وضعیت فعال در یک ساعت گذشته
          const { count: activeCount } = await supabase
            .from('tickets')
            .select('player_user_id', { count: 'exact', head: true })
            .in('reservation_status', ['confirmed', 'consumed', 'reserved'])
            .gte('created_at', oneHourAgo);

          setActivePlayers(activeCount || 0);
        }

        // online players: از presence API (اگر prop ارائه شده باشد، همان را نمایش بده)
        if (onlinePlayersCount !== undefined) {
          setOnlinePlayers(onlinePlayersCount);
        } else {
          // fallback قدیمی (در صورت نبود prop)
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { count: onlineCount } = await supabase
            .from('tickets')
            .select('player_user_id', { count: 'exact', head: true })
            .gte('created_at', oneDayAgo);
          setOnlinePlayers(onlineCount || 0);
        }
      } catch (error) {
        console.error('Error fetching lobby stats:', error);
        // در صورت خطا، مقادیر پیش‌فرض نمایش داده می‌شود
        setActivePlayers(activePlayersCount ?? 0);
        setOnlinePlayers(onlinePlayersCount ?? 0);
      } finally {
        setLoading(false);
      }
    }

    fetchLobbyStats();

    // به‌روزرسانی هر 30 ثانیه
    const interval = setInterval(fetchLobbyStats, 30000);

    return () => clearInterval(interval);
  }, [activePlayersCount, onlinePlayersCount]);

  if (loading) {
    return (
      <div className={`${styles.lobbyInfo} ${className || ''}`}>
        <div className={styles.chip}>
          <span className={`${styles.chipValue} latin-number`}>...</span>
          <span className={styles.chipLabel}>پلیر اکتیو</span>
        </div>
        <div className={styles.chip}>
          <span className={`${styles.chipValue} latin-number`}>...</span>
          <span className={styles.chipLabel}>پلیر آنلاین</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.lobbyInfo} ${className || ''}`}>
      <div className={styles.chip}>
        <span className={`${styles.chipValue} ${styles.activePlayers} latin-number`}>
          {activePlayers.toLocaleString('en-US')}
        </span>
        <span className={styles.chipLabel}>پلیر اکتیو</span>
      </div>
      <div className={styles.chip}>
        <span className={`${styles.chipValue} ${styles.onlinePlayers} latin-number`}>
          {onlinePlayers.toLocaleString('en-US')}
        </span>
        <span className={styles.chipLabel}>پلیر آنلاین</span>
      </div>
    </div>
  );
}

