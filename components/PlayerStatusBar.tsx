"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import styles from './PlayerStatusBar.module.css';

// Import آواتارهای موجود
import avatar001 from '@/src/assets/avatars/avatar-001.png';
import avatar002 from '@/src/assets/avatars/avatar-002.png';
import avatar003 from '@/src/assets/avatars/avatar-003.png';
import avatar004 from '@/src/assets/avatars/avatar-004.png';
import avatar005 from '@/src/assets/avatars/avatar-005.png';
import avatar006 from '@/src/assets/avatars/avatar-006.png';
import avatar007 from '@/src/assets/avatars/avatar-007.png';
import avatar008 from '@/src/assets/avatars/avatar-008.png';
import avatar009 from '@/src/assets/avatars/avatar-009.png';
import avatar010 from '@/src/assets/avatars/avatar-010.png';
import avatar011 from '@/src/assets/avatars/avatar-011.png';
import avatar012 from '@/src/assets/avatars/avatar-012.png';
import avatar013 from '@/src/assets/avatars/avatar-013.png';
import avatar014 from '@/src/assets/avatars/avatar-014.png';
import avatar015 from '@/src/assets/avatars/avatar-015.png';
import avatar017 from '@/src/assets/avatars/avatar-017.png';
import avatar018 from '@/src/assets/avatars/avatar-018.png';
import avatar019 from '@/src/assets/avatars/avatar-019.png';
import avatar020 from '@/src/assets/avatars/avatar-020.png';
import avatar021 from '@/src/assets/avatars/avatar-021.png';
import avatar022 from '@/src/assets/avatars/avatar-022.png';
import avatar023 from '@/src/assets/avatars/avatar-023.png';
import avatar024 from '@/src/assets/avatars/avatar-024.png';
import avatar025 from '@/src/assets/avatars/avatar-025.png';

const avatarMap: Record<string, any> = {
  '001': avatar001,
  '002': avatar002,
  '003': avatar003,
  '004': avatar004,
  '005': avatar005,
  '006': avatar006,
  '007': avatar007,
  '008': avatar008,
  '009': avatar009,
  '010': avatar010,
  '011': avatar011,
  '012': avatar012,
  '013': avatar013,
  '014': avatar014,
  '015': avatar015,
  '017': avatar017,
  '018': avatar018,
  '019': avatar019,
  '020': avatar020,
  '021': avatar021,
  '022': avatar022,
  '023': avatar023,
  '024': avatar024,
  '025': avatar025,
};

interface PlayerStatusBarProps {
  tomanBalance: number;
  loading?: boolean;
}

/**
 * کامپوننت نوار وضعیت بازیکن
 * نمایش آواتار و اسم بازیکن در سمت چپ و موجودی کیف پول در سمت راست
 */
export default function PlayerStatusBar({ tomanBalance, loading = false }: PlayerStatusBarProps) {
  const [playerName, setPlayerName] = useState<string>('اسم بازیکن');
  const [avatarId, setAvatarId] = useState<string>('001');
  const [playerLoading, setPlayerLoading] = useState<boolean>(true);
  const [shortId, setShortId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // helper: تولید یک ID کوتاه ۱۰ رقمی پایدار از روی UUID
  const makeShortIdFromUuid = (id: string): string => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = Math.imul(31, hash) + id.charCodeAt(i);
    }
    const num = (hash >>> 0) % 1_000_000_0000; // 10^10
    return num.toString().padStart(10, '0');
  };

  useEffect(() => {
    async function fetchPlayerInfo() {
      try {
        setPlayerLoading(true);
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          setPlayerLoading(false);
          return;
        }

        // تنظیم shortId از روی UUID کاربر
        setShortId(makeShortIdFromUuid(user.id));

        // دریافت نام نمایشی از user_profiles (nickname) یا users (username)
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('nickname, avatar_url, metadata')
          .eq('user_id', user.id)
          .single();

        // دریافت username از users
        const { data: dbUser } = await supabase
          .from('users')
          .select('username')
          .eq('id', user.id)
          .single();

        // اولویت: nickname از user_profiles > username از users > email
        if (profile?.nickname) {
          setPlayerName(profile.nickname);
        } else if (dbUser?.username) {
          setPlayerName(dbUser.username);
        } else if (user.email) {
          setPlayerName(user.email.split('@')[0]);
        } else {
          setPlayerName('کاربر');
        }

        // دریافت avatar_id از metadata یا profiles قدیمی
        if (profile?.metadata && typeof profile.metadata === 'object') {
          const metadata = profile.metadata as any;
          if (metadata.avatar_id) {
            setAvatarId(String(metadata.avatar_id).padStart(3, '0'));
          }
        } else {
          // Fallback به profiles قدیمی
          const { data: oldProfile } = await supabase
            .from('profiles')
            .select('avatar_id')
            .eq('id', user.id)
            .single();

          if (oldProfile?.avatar_id) {
            const avatarNumber = String(oldProfile.avatar_id).padStart(3, '0');
            setAvatarId(avatarNumber);
          } else {
            setAvatarId('001'); // پیش‌فرض
          }
        }
      } catch (error) {
        console.error('Error fetching player info:', error);
      } finally {
        setPlayerLoading(false);
      }
    }

    fetchPlayerInfo();
  }, [refreshKey]);

    // گوش دادن به event برای refresh کردن بعد از به‌روزرسانی نام نمایشی یا آواتار
    useEffect(() => {
      const handleProfileUpdate = (event: Event) => {
        console.log('PlayerStatusBar: Received profile update event', event);
        // با تغییر refreshKey، useEffect دوباره اجرا می‌شود و fetchPlayerInfo صدا زده می‌شود
        setRefreshKey(prev => prev + 1);
      };

      window.addEventListener('profileDisplayNameUpdated', handleProfileUpdate);
      window.addEventListener('profileAvatarUpdated', handleProfileUpdate);

      return () => {
        window.removeEventListener('profileDisplayNameUpdated', handleProfileUpdate);
        window.removeEventListener('profileAvatarUpdated', handleProfileUpdate);
      };
    }, []);

  const formatTomanBalance = (amount: number): string => {
    return amount.toLocaleString('en-US');
  };

  const getAvatarImage = () => {
    return avatarMap[avatarId] || avatar001;
  };

  return (
    <div className={styles.playerStatusBar}>
      <div className={styles.playerInfo}>
        <div className={styles.avatarContainer}>
          <Image
            src={getAvatarImage()}
            alt="Player Avatar"
            className={styles.avatar}
            width={50}
            height={50}
          />
        </div>
        <div className={styles.playerName}>
          {playerLoading ? (
            '...'
          ) : (
            <div>{playerName}</div>
          )}
        </div>
      </div>
      <div className={styles.balanceInfo}>
        {loading ? (
          <span className={styles.loadingText}>...</span>
        ) : (
          <span className={styles.amount}>{formatTomanBalance(tomanBalance)}</span>
        )}
      </div>
    </div>
  );
}

