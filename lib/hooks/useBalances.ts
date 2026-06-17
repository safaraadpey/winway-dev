"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getMyDingBalance } from '../features/ding/ding';
import { isDingEnabled } from "@/lib/audio-settings";
import { playDingTone } from "@/lib/number-audio";
import { HARD_EXIT_EVENT, isHardExiting } from "@/lib/auth/hardExit";

export interface Balances {
  dingBalance: number;
  tomanBalance: number;
  lockedTomanBalance: number;
  loading: boolean;
  error: string | null;
  isAnimating: boolean;
  isTomanAnimating: boolean;
  triggerTomanCelebrate: () => void;
  /**
   * Refresh wallet balances (toman + locked) immediately from DB.
   * Useful right after purchase/cancel actions to avoid waiting for realtime delay.
   */
  refreshWalletBalances?: () => Promise<void>;
  /**
   * Refresh both toman + ding balances immediately from server.
   */
  refreshAllBalances?: () => Promise<void>;
  /**
   * Credit ding locally when a draw number is revealed in LiveRoom.
   * delta = matched card count × ding_per_number (computed in LiveRoom).
   */
  creditDingOnReveal?: (revealKey: string, delta: number) => void;
  /**
   * Poll wallet balance after room settlement (prize payout / hold release).
   */
  scheduleWalletBalanceSync?: (reason?: string) => void;
}

/**
 * Hook برای دریافت موجودی Ding و تومان کاربر فعلی
 * از Supabase و مدیریت realtime updates
 */
export function useBalances(): Balances {
  const [dingBalance, setDingBalance] = useState<number>(0);
  const [tomanBalance, setTomanBalance] = useState<number>(0);
  const [lockedTomanBalance, setLockedTomanBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isTomanAnimating, setIsTomanAnimating] = useState<boolean>(false);
  const tomanAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Refs برای مدیریت mount و hydration
  const isMountedRef = useRef<boolean>(false);
  const hasHydratedRef = useRef<boolean>(false);
  const walletChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const balanceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentBalanceRef = useRef<number>(0);

  // ---- Ding reveal credits (local, synced to server on hydrate / game end) ----
  const creditedRevealKeysRef = useRef<Set<string>>(new Set());
  const activeWalletSyncKeyRef = useRef<string | null>(null);
  const walletSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTomanBalanceRef = useRef<number>(0);

  const refreshWalletBalances = async (): Promise<void> => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) return;

      const { data: walletData, error: walletError } = await supabase
        .from("wallets")
        .select("balance, locked_amount")
        .eq("user_id", user.id)
        .single();

      if (walletError) return;
      if (!isMountedRef.current) return;

      const balance = Number((walletData as any)?.balance ?? 0) || 0;
      const locked = Number((walletData as any)?.locked_amount ?? 0) || 0;
      setTomanBalance(balance);
      setLockedTomanBalance(locked);
      currentTomanBalanceRef.current = balance;
    } catch (err) {
      console.warn("[useBalances] refreshWalletBalances failed", err);
    }
  };

  const refreshAllBalances = async (): Promise<void> => {
    try {
      await refreshWalletBalances();
      const { balance: serverBalance } = await fetchDingBalanceFromApi();
      if (!isMountedRef.current) return;
      setDingBalance(serverBalance);
      currentBalanceRef.current = serverBalance;
    } catch (err) {
      console.warn("[useBalances] refreshAllBalances failed", err);
    }
  };

  async function fetchDingBalanceFromApi(): Promise<{ balance: number; updated_at: string | null }> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token || null;

    const res = await fetch("/api/me/ding-balance", {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`ding-balance fetch failed (${res.status})`);
    }

    const json = (await res.json()) as { balance: number; updated_at: string | null };
    return {
      balance: Number(json?.balance ?? 0) || 0,
      updated_at: json?.updated_at ?? null,
    };
  }

  // مدیریت mount/unmount
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[useBalances] Component mounted, isMountedRef.current = true');

    return () => {
      isMountedRef.current = false;
      console.log('[useBalances] Component unmounted, isMountedRef.current = false');
      // Cleanup animation timeout
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      // Cleanup balance update timeout
      if (balanceUpdateTimeoutRef.current) {
        clearTimeout(balanceUpdateTimeoutRef.current);
        balanceUpdateTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    async function fetchBalances() {
      if (isHardExiting()) return;
      try {
        console.log('[useBalances] fetchBalances started');
        setLoading(true);
        setError(null);

        // دریافت user فعلی
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        
        if (userError || !user) {
          console.warn('[useBalances] No user found:', userError);
          if (isMountedRef.current) {
            setError('کاربر پیدا نشد');
            setDingBalance(0);
            setTomanBalance(0);
            setLoading(false);
          }
          return;
        }

        console.log('[useBalances] User found:', user.id);

        // NOTE: Admin/Super/Agent ممکن است به ding-balance endpoint دسترسی نداشته باشند.
        // بنابراین failure در Ding نباید مانع دریافت موجودی تومان (wallets) شود.

        // مرحله 1: دریافت موجودی تومان از wallets (IRR)
        const { data: walletData, error: walletError } = await supabase
          .from('wallets')
          .select('balance, locked_amount')
          .eq('user_id', user.id)
          .single();

        if (walletError) {
          if (walletError.code === 'PGRST116') {
            // ردیف وجود ندارد، موجودی صفر است
            if (isMountedRef.current) {
              setTomanBalance(0);
              setLockedTomanBalance(0);
            }
          } else {
            console.error('Error fetching wallet:', walletError);
            if (isMountedRef.current) {
              setTomanBalance(0);
              setLockedTomanBalance(0);
            }
          }
        } else {
          if (isMountedRef.current) {
            const balance = Number((walletData as any)?.balance ?? 0) || 0;
            const locked = Number((walletData as any)?.locked_amount ?? 0) || 0;
            setTomanBalance(balance);
            setLockedTomanBalance(locked);
            currentTomanBalanceRef.current = balance;
          }
        }

        // مرحله 2: دریافت موجودی Ding اولیه (hydration) - best effort
        try {
          const ding =
            (await fetchDingBalanceFromApi()).balance ?? (await getMyDingBalance());
          console.log('[useBalances] Initial ding balance fetched:', ding);

          if (isMountedRef.current) {
            setDingBalance(ding);
            currentBalanceRef.current = ding;
            hasHydratedRef.current = true;
            console.log(
              '[useBalances] ✅ Hydration complete, hasHydratedRef.current = true, balance:',
              ding
            );
          }
        } catch (dingErr) {
          console.warn('[useBalances] Ding hydration skipped (non-fatal):', dingErr);
          if (isMountedRef.current) {
            // keep dingBalance as-is (default 0), but do not fail overall balances
            hasHydratedRef.current = true;
          }
        }

        // مرحله 3: realtime برای ding_balances حذف شده است؛
        // هیدراسیون و پایان بازی از API؛ در LiveRoom با creditDingOnReveal محلی sync می‌شود.

        // Subscribe به تغییرات wallet balance
        if (walletChannelRef.current) {
          supabase.removeChannel(walletChannelRef.current);
          walletChannelRef.current = null;
        }

        walletChannelRef.current = supabase
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
              if (isMountedRef.current) {
                const newBalance = Number((payload.new as any)?.balance ?? 0) || 0;
                const locked = Number((payload.new as any)?.locked_amount ?? 0) || 0;
                setTomanBalance(newBalance);
                setLockedTomanBalance(locked);
                currentTomanBalanceRef.current = newBalance;
              }
            }
          )
          .subscribe();

        if (isMountedRef.current) {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error in fetchBalances:', err);
        if (isMountedRef.current) {
          setError('خطا در دریافت موجودی');
          setDingBalance(0);
          setTomanBalance(0);
          setLoading(false);
        }
      }
    }

    // Initial fetch (might be unauthenticated on login page; auth listener below will refetch on sign-in)
    fetchBalances();

    const onHardExit = () => {
      setDingBalance(0);
      setTomanBalance(0);
      setLockedTomanBalance(0);
      setLoading(false);
      setError(null);
      hasHydratedRef.current = false;
      currentBalanceRef.current = 0;
      if (walletChannelRef.current) {
        supabase.removeChannel(walletChannelRef.current);
        walletChannelRef.current = null;
      }
      if (walletSyncTimerRef.current) {
        clearTimeout(walletSyncTimerRef.current);
        walletSyncTimerRef.current = null;
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      if (balanceUpdateTimeoutRef.current) {
        clearTimeout(balanceUpdateTimeoutRef.current);
        balanceUpdateTimeoutRef.current = null;
      }
      if (tomanAnimationTimeoutRef.current) {
        clearTimeout(tomanAnimationTimeoutRef.current);
        tomanAnimationTimeoutRef.current = null;
      }
    };
    window.addEventListener(HARD_EXIT_EVENT, onHardExit);

    // Critical: refetch balances when auth state becomes available (first login / first navigation)
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!isMountedRef.current || isHardExiting()) return;

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        void fetchBalances();
      }

      if (event === "SIGNED_OUT") {
        setDingBalance(0);
        setTomanBalance(0);
        setLockedTomanBalance(0);
        setLoading(false);
        setError(null);
        hasHydratedRef.current = false;
        currentBalanceRef.current = 0;

        if (walletChannelRef.current) {
          supabase.removeChannel(walletChannelRef.current);
          walletChannelRef.current = null;
        }
      }
    });

    return () => {
      window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
      console.log('[useBalances] Cleanup: unsubscribing and removing channels');
      if (walletChannelRef.current) {
        supabase.removeChannel(walletChannelRef.current);
        walletChannelRef.current = null;
      }
      data?.subscription?.unsubscribe();
      if (walletSyncTimerRef.current) {
        clearTimeout(walletSyncTimerRef.current);
        walletSyncTimerRef.current = null;
      }
      // Cleanup animation timeout
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      // Cleanup balance update timeout
      if (balanceUpdateTimeoutRef.current) {
        clearTimeout(balanceUpdateTimeoutRef.current);
        balanceUpdateTimeoutRef.current = null;
      }
      if (tomanAnimationTimeoutRef.current) {
        clearTimeout(tomanAnimationTimeoutRef.current);
        tomanAnimationTimeoutRef.current = null;
      }
    };
  }, []);

  const triggerTomanCelebrate = () => {
    if (!isMountedRef.current) return;
    setIsTomanAnimating(true);
    if (tomanAnimationTimeoutRef.current) {
      clearTimeout(tomanAnimationTimeoutRef.current);
    }
    tomanAnimationTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsTomanAnimating(false);
      tomanAnimationTimeoutRef.current = null;
    }, 900);
  };

  const creditDingOnReveal = (revealKey: string, delta: number) => {
    if (!revealKey || delta <= 0) return;
    if (creditedRevealKeysRef.current.has(revealKey)) return;
    creditedRevealKeysRef.current.add(revealKey);

    const prevBalance = currentBalanceRef.current;
    currentBalanceRef.current = prevBalance + delta;
    const nextBalance = currentBalanceRef.current;

    console.log("[dingReveal] credit", { revealKey, delta, prevBalance, nextBalance });

    const COIN_ANIMATION_DELAY = 400;
    if (balanceUpdateTimeoutRef.current) {
      clearTimeout(balanceUpdateTimeoutRef.current);
    }
    balanceUpdateTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      const latestBalance = currentBalanceRef.current;
      setDingBalance(latestBalance);

      if (isDingEnabled()) {
        void playDingTone();
      }

      if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
      setIsAnimating(true);
      animationTimeoutRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        setIsAnimating(false);
        animationTimeoutRef.current = null;
      }, 800);
      balanceUpdateTimeoutRef.current = null;
    }, COIN_ANIMATION_DELAY);
  };

  const scheduleWalletBalanceSync = (reason = "settlement") => {
    if (activeWalletSyncKeyRef.current === reason) return;
    activeWalletSyncKeyRef.current = reason;

    if (walletSyncTimerRef.current) {
      clearTimeout(walletSyncTimerRef.current);
      walletSyncTimerRef.current = null;
    }

    const maxRetries = 8;
    const retryDelayMs = 450;

    const attempt = async (index: number) => {
      if (!isMountedRef.current) return;
      if (activeWalletSyncKeyRef.current !== reason) return;

      const prevBalance = currentTomanBalanceRef.current;
      await refreshWalletBalances();

      if (!isMountedRef.current) return;
      if (activeWalletSyncKeyRef.current !== reason) return;

      const synced = currentTomanBalanceRef.current !== prevBalance;
      if (synced || index >= maxRetries - 1) {
        activeWalletSyncKeyRef.current = null;
        return;
      }

      walletSyncTimerRef.current = setTimeout(() => {
        walletSyncTimerRef.current = null;
        void attempt(index + 1);
      }, retryDelayMs);
    };

    walletSyncTimerRef.current = setTimeout(() => {
      walletSyncTimerRef.current = null;
      void attempt(0);
    }, 200);
  };

  return {
    dingBalance,
    tomanBalance,
    lockedTomanBalance,
    loading,
    error,
    isAnimating,
    isTomanAnimating,
    triggerTomanCelebrate,
    refreshWalletBalances,
    refreshAllBalances,
    creditDingOnReveal,
    scheduleWalletBalanceSync,
  };
}
