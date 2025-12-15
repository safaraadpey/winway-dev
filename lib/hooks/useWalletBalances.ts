"use client";

import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getMyDingBalance } from '../features/ding/ding';

export interface WalletBalances {
  dingBalance: number;
  tomanBalance: number;
  loading: boolean;
  error: string | null;
}

/**
 * Hook برای دریافت موجودی Ding و تومان کاربر فعلی
 * از Supabase و مدیریت realtime updates
 */
export function useWalletBalances(): WalletBalances {
  const [dingBalance, setDingBalance] = useState<number>(0);
  const [tomanBalance, setTomanBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let walletChannel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchBalances() {
      try {
        setLoading(true);
        setError(null);

        // دریافت user فعلی
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          if (isMounted) {
            setError('کاربر پیدا نشد');
            setDingBalance(0);
            setTomanBalance(0);
            setLoading(false);
          }
          return;
        }

        // دریافت موجودی Ding
        const ding = await getMyDingBalance();
        if (isMounted) {
          setDingBalance(ding);
        }

        // دریافت موجودی تومان از wallets
        const { data: walletData, error: walletError } = await supabase
          .from('wallets')
          .select('balance')
          .eq('user_id', user.id)
          .single();

        if (walletError) {
          if (walletError.code === 'PGRST116') {
            // ردیف وجود ندارد، موجودی صفر است
            if (isMounted) {
              setTomanBalance(0);
            }
          } else {
            console.error('Error fetching wallet:', walletError);
            if (isMounted) {
              setTomanBalance(0);
            }
          }
        } else {
          if (isMounted) {
            setTomanBalance(walletData?.balance || 0);
          }
        }

        // Subscribe به تغییرات wallet balance
        walletChannel = supabase
          .channel(`wallet_balance_changes_${user.id}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'wallets',
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (isMounted) {
                const newBalance = payload.new.balance as number;
                setTomanBalance(newBalance || 0);
              }
            }
          )
          .subscribe();

        if (isMounted) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error in fetchBalances:', err);
        if (isMounted) {
          setError('خطا در دریافت موجودی');
          setDingBalance(0);
          setTomanBalance(0);
          setLoading(false);
        }
      }
    }

    fetchBalances();

    return () => {
      isMounted = false;
      if (walletChannel) {
        supabase.removeChannel(walletChannel);
      }
    };
  }, []);

  return {
    dingBalance,
    tomanBalance,
    loading,
    error,
  };
}

