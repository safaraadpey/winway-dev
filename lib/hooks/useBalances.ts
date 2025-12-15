"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { getMyDingBalance } from '../features/ding/ding';

/**
 * تابع پخش صدای دینگ (منتقل شده از BingoCard)
 * این صدا هنگام افزایش موجودی Ding پخش می‌شود
 * 
 * @param audioContextRef - ref به AudioContext که از قبل آماده شده است
 */
function playDingSound(audioContextRef: React.MutableRefObject<AudioContext | null>) {
  console.log('[playDingSound] Attempting to play ding sound...');
  
  if (!audioContextRef.current) {
    console.warn('[playDingSound] AudioContext not available');
    return;
  }

  const audioContext = audioContextRef.current;

  // اگر AudioContext suspended است، resume کن
  if (audioContext.state === 'suspended') {
    console.log('[playDingSound] AudioContext suspended, attempting to resume...');
    audioContext.resume().then(() => {
      console.log('[playDingSound] ✅ AudioContext resumed successfully');
      playSound(audioContext);
    }).catch((error) => {
      console.error('[playDingSound] ❌ Failed to resume AudioContext:', error);
    });
  } else {
    playSound(audioContext);
  }

  function playSound(ctx: AudioContext) {
    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
      
      console.log('[playDingSound] ✅ Sound playing started (frequency: 800Hz, duration: 0.3s)');
      
      oscillator.onended = () => {
        console.log('[playDingSound] ✅ Sound finished playing');
      };
    } catch (error) {
      console.error('[playDingSound] ❌ Failed to play sound:', error);
    }
  }
}

export interface Balances {
  dingBalance: number;
  tomanBalance: number;
  lockedTomanBalance: number;
  loading: boolean;
  error: string | null;
  isAnimating: boolean;
  /**
   * Refresh wallet balances (toman + locked) immediately from DB.
   * Useful right after purchase/cancel actions to avoid waiting for realtime delay.
   */
  refreshWalletBalances?: () => Promise<void>;
  /**
   * Sync dingBalance from server via API, once per draw (guarded + bounded retries).
   * markDetected=true یعنی این draw قطعاً روی یکی از کارت‌های کاربر mark داشته است.
   */
  scheduleDingBalanceSync?: (drawId: string, markDetected: boolean) => void;
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

  // Refs برای مدیریت mount و hydration
  const isMountedRef = useRef<boolean>(false);
  const hasHydratedRef = useRef<boolean>(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const balanceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentBalanceRef = useRef<number>(0);

  // ---- Ding balance sync guards (API-based, per-draw) ----
  const lastFetchedDrawIdRef = useRef<string | null>(null);
  const pendingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const scheduledCountRef = useRef<Record<string, number>>({});

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

      setTomanBalance(Number(walletData?.balance ?? 0) || 0);
      setLockedTomanBalance(Number((walletData as any)?.locked_amount ?? 0) || 0);
    } catch (err) {
      console.warn("[useBalances] refreshWalletBalances failed", err);
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

  // مدیریت mount/unmount و آماده‌سازی AudioContext
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[useBalances] Component mounted, isMountedRef.current = true');
    
    // آماده‌سازی AudioContext از قبل (برای رفع مشکل autoplay policy)
    if (typeof window !== 'undefined') {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
          console.log('[useBalances] AudioContext created, state:', audioContextRef.current.state);
          
          // اگر suspended است، سعی کن resume کن (بعد از user interaction)
          if (audioContextRef.current.state === 'suspended') {
            // یک event listener برای اولین user interaction اضافه کن
            const resumeAudio = async () => {
              if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                try {
                  await audioContextRef.current.resume();
                  console.log('[useBalances] ✅ AudioContext resumed after user interaction');
                } catch (error) {
                  console.warn('[useBalances] Failed to resume AudioContext:', error);
                }
              }
            };
            
            // چند event مختلف را امتحان کن
            const events = ['click', 'touchstart', 'keydown'];
            events.forEach(event => {
              document.addEventListener(event, resumeAudio, { once: true });
            });
          }
        }
      } catch (error) {
        console.warn('[useBalances] Failed to create AudioContext:', error);
      }
    }
    
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
      // Cleanup AudioContext
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(console.error);
        audioContextRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let walletChannel: ReturnType<typeof supabase.channel> | null = null;

    async function fetchBalances() {
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

        // مرحله 1: دریافت موجودی Ding اولیه (hydration)
        // منبع: API (نه realtime)
        const ding = (await fetchDingBalanceFromApi()).balance ?? (await getMyDingBalance());
        console.log('[useBalances] Initial ding balance fetched:', ding);
        
        if (isMountedRef.current) {
          setDingBalance(ding);
          currentBalanceRef.current = ding;
          hasHydratedRef.current = true;
          console.log('[useBalances] ✅ Hydration complete, hasHydratedRef.current = true, balance:', ding);
        }
        // مرحله 2: realtime برای ding_balances حذف شده است؛
        // DingBalance فقط با API و از روی draw sync می‌شود.

        // دریافت موجودی تومان از wallets
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
            const balance = walletData?.balance || 0;
            const locked = walletData?.locked_amount || 0;
            setTomanBalance(balance);
            setLockedTomanBalance(locked);
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
              if (isMountedRef.current) {
                const newBalance = payload.new.balance as number;
                const locked = (payload.new as any).locked_amount || 0;
                setTomanBalance(newBalance || 0);
                setLockedTomanBalance(locked);
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

    fetchBalances();

    return () => {
      console.log('[useBalances] Cleanup: unsubscribing and removing channels');
      if (walletChannel) {
        supabase.removeChannel(walletChannel);
      }
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
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
    };
  }, []);

  // API-based ding sync per draw, with bounded retry
  const scheduleDingBalanceSync = (drawId: string, markDetected: boolean) => {
    if (!drawId) return;
    if (!markDetected) return;

    const prevCount = scheduledCountRef.current[drawId] ?? 0;
    scheduledCountRef.current[drawId] = prevCount + 1;

    if (lastFetchedDrawIdRef.current === drawId) {
      console.log("[dingSync] schedule ignored (already scheduled for draw)", { drawId, count: scheduledCountRef.current[drawId] });
      return;
    }

    lastFetchedDrawIdRef.current = drawId;

    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }

    const initialDelay = 100;
    console.log("[dingSync] scheduled", { drawId, markDetected: true, initialDelayMs: initialDelay });

    pendingTimerRef.current = setTimeout(() => {
      pendingTimerRef.current = null;
      void (async function attempt(attemptIndex: number) {
        const maxRetries = 2; // after first attempt, retry up to 2 times
        if (!isMountedRef.current) return;
        if (lastFetchedDrawIdRef.current !== drawId) return;
        if (inFlightRef.current) {
          console.log("[dingSync] inFlight, skipping attempt", { drawId, attemptIndex });
          return;
        }

        inFlightRef.current = true;
        const prevBalance = currentBalanceRef.current;
        const startedAt = Date.now();

        try {
          console.log("[dingSync] fetching", { drawId, attemptIndex, prevBalance });
          const { balance: serverBalance, updated_at } = await fetchDingBalanceFromApi();
          const elapsedMs = Date.now() - startedAt;

          console.log("[dingSync] fetched", {
            drawId,
            attemptIndex,
            elapsedMs,
            prevBalance,
            serverBalance,
            updated_at,
          });

          if (!isMountedRef.current) return;
          if (lastFetchedDrawIdRef.current !== drawId) return;

          // Always update ref + state to server truth
          // Animate only on increase
          if (hasHydratedRef.current && serverBalance > prevBalance) {
            const increase = serverBalance - prevBalance;
            console.log("[dingSync] increase detected -> animate", { drawId, increase, prevBalance, serverBalance });

            // keep coin-sync behavior
            const COIN_ANIMATION_DELAY = 400;
            if (balanceUpdateTimeoutRef.current) clearTimeout(balanceUpdateTimeoutRef.current);
            balanceUpdateTimeoutRef.current = setTimeout(() => {
              if (!isMountedRef.current) return;
              setDingBalance(serverBalance);
              currentBalanceRef.current = serverBalance;
              playDingSound(audioContextRef);

              if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
              setIsAnimating(true);
              animationTimeoutRef.current = setTimeout(() => {
                if (!isMountedRef.current) return;
                setIsAnimating(false);
                animationTimeoutRef.current = null;
              }, 800);
            }, COIN_ANIMATION_DELAY);
          } else {
            // no increase: just sync state
            setDingBalance(serverBalance);
            currentBalanceRef.current = serverBalance;
          }

          // Conditional retry: markDetected is true but server didn't increase yet
          if (serverBalance <= prevBalance && attemptIndex < maxRetries) {
            const retryDelay = 250 + Math.floor(Math.random() * 151); // 250..400
            console.log("[dingSync] retry scheduled", { drawId, attemptIndex, retryDelayMs: retryDelay });
            setTimeout(() => {
              if (!isMountedRef.current) return;
              if (lastFetchedDrawIdRef.current !== drawId) return;
              if (inFlightRef.current) return;
              void attempt(attemptIndex + 1);
            }, retryDelay);
          } else if (serverBalance <= prevBalance && attemptIndex >= maxRetries) {
            console.warn("[dingSync] no increase after max retries", { drawId, prevBalance, serverBalance });
          }
        } catch (err) {
          console.warn("[dingSync] fetch failed", { drawId, attemptIndex, err });
        } finally {
          inFlightRef.current = false;
        }
      })(0);
    }, initialDelay);
  };

  return {
    dingBalance,
    tomanBalance,
    lockedTomanBalance,
    loading,
    error,
    isAnimating,
    refreshWalletBalances,
    scheduleDingBalanceSync,
  };
}
