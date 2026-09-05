"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../supabaseClient";
import { getMyDingBalance } from "../features/ding/ding";
import { isDingEnabled } from "@/lib/audio-settings";
import { playDingTone } from "@/lib/number-audio";
import { HARD_EXIT_EVENT, isHardExiting } from "@/lib/auth/hardExit";
import { isAgentPanelLocation, isAgentPanelPath } from "@/lib/auth/isAgentPanelPath";
import {
  BALANCE_SHELL_TTL_MS,
  clearBalanceShell,
  isBalanceShellFresh,
  readBalanceShell,
  writeBalanceShell,
} from "@/lib/header/balanceShell";
import {
  canApplyLiveDingRevealCredit,
  resolveDingSettleMode,
  type DingSettleMode,
} from "@/lib/liveRoom/liveDingUi";

export type RefreshBalancesOptions = {
  force?: boolean;
  /** Only header tap should spin the capsules. Background sync stays silent. */
  userInitiated?: boolean;
};

export interface Balances {
  dingBalance: number;
  tomanBalance: number;
  lockedTomanBalance: number;
  /** True only before first successful hydrate (backward compat for header) */
  loading: boolean;
  hasHydrated: boolean;
  isRefreshing: boolean;
  error: string | null;
  isAnimating: boolean;
  isTomanAnimating: boolean;
  triggerTomanCelebrate: () => void;
  triggerDingCelebrate: () => void;
  refreshWalletBalances?: () => Promise<void>;
  refreshAllBalances?: (options?: RefreshBalancesOptions) => Promise<void>;
  creditDingOnReveal?: (
    revealKey: string,
    delta: number,
    dingSettleMode?: DingSettleMode
  ) => void;
  /** Live room: room_level disables mid-game optimistic Ding; per_draw unchanged. */
  setLiveDingSettleMode?: (mode: DingSettleMode) => void;
  /** Apply authoritative ding_balances after room_level settlement commit. */
  applySettledDingBalance?: (balance: number) => void;
  scheduleWalletBalanceSync?: (reason?: string) => void;
}

function readInitialBalanceState() {
  const shell = readBalanceShell();
  return {
    shell,
    dingBalance: shell?.dingBalance ?? 0,
    tomanBalance: shell?.tomanBalance ?? 0,
    lockedTomanBalance: shell?.lockedTomanBalance ?? 0,
    hasHydrated: Boolean(shell),
    fetchedAt: shell?.fetchedAt ?? 0,
  };
}

/**
 * Hook برای دریافت موجودی Ding و تومان کاربر فعلی
 * کش TTL + refresh کنترل‌شده؛ بدون blank کردن UI بعد از hydrate
 */
export function useBalances(): Balances {
  const pathname = usePathname();
  const skipDingBalanceRef = useRef(false);
  const loggedDingSkipRef = useRef(false);
  skipDingBalanceRef.current =
    isAgentPanelPath(pathname) || isAgentPanelLocation();
  const wasAgentPanelRef = useRef(skipDingBalanceRef.current);

  const initialRef = useRef(readInitialBalanceState());

  const [dingBalance, setDingBalance] = useState<number>(
    initialRef.current.dingBalance
  );
  const [tomanBalance, setTomanBalance] = useState<number>(
    initialRef.current.tomanBalance
  );
  const [lockedTomanBalance, setLockedTomanBalance] = useState<number>(
    initialRef.current.lockedTomanBalance
  );
  const [hasHydrated, setHasHydrated] = useState<boolean>(
    initialRef.current.hasHydrated
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isTomanAnimating, setIsTomanAnimating] = useState<boolean>(false);
  const tomanAnimationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isMountedRef = useRef<boolean>(false);
  const hasHydratedRef = useRef<boolean>(initialRef.current.hasHydrated);
  const lastFetchedAtRef = useRef<number>(initialRef.current.fetchedAt);
  const walletChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const balanceUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const currentBalanceRef = useRef<number>(initialRef.current.dingBalance);
  const settledDingRef = useRef<number>(initialRef.current.dingBalance);
  const fetchInFlightRef = useRef(false);
  const liveDingSettleModeRef = useRef<DingSettleMode>("per_draw");

  const creditedRevealKeysRef = useRef<Set<string>>(new Set());
  const activeWalletSyncKeyRef = useRef<string | null>(null);
  const walletSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentTomanBalanceRef = useRef<number>(initialRef.current.tomanBalance);
  const lockedTomanBalanceRef = useRef<number>(initialRef.current.lockedTomanBalance);

  const persistBalanceShell = useCallback(
    (ding: number, toman: number, locked: number) => {
      const fetchedAt = Date.now();
      lastFetchedAtRef.current = fetchedAt;
      writeBalanceShell({
        dingBalance: ding,
        tomanBalance: toman,
        lockedTomanBalance: locked,
        fetchedAt,
      });
    },
    []
  );

  async function fetchDingBalanceFromApi(): Promise<{
    balance: number;
    updated_at: string | null;
  }> {
    if (skipDingBalanceRef.current || isAgentPanelLocation()) {
      return { balance: 0, updated_at: null };
    }

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

    const json = (await res.json()) as {
      balance: number;
      updated_at: string | null;
    };
    return {
      balance: Number(json?.balance ?? 0) || 0,
      updated_at: json?.updated_at ?? null,
    };
  }

  const applyBalances = useCallback(
    (ding: number, toman: number, locked: number) => {
      setDingBalance(ding);
      setTomanBalance(toman);
      setLockedTomanBalance(locked);
      currentBalanceRef.current = ding;
      currentTomanBalanceRef.current = toman;
      lockedTomanBalanceRef.current = locked;
      persistBalanceShell(ding, toman, locked);
      hasHydratedRef.current = true;
      setHasHydrated(true);
    },
    [persistBalanceShell]
  );

  const refreshWalletBalances = useCallback(async (): Promise<void> => {
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

      const balance = Number((walletData as { balance?: number })?.balance ?? 0) || 0;
      const locked =
        Number((walletData as { locked_amount?: number })?.locked_amount ?? 0) ||
        0;

      setTomanBalance(balance);
      setLockedTomanBalance(locked);
      currentTomanBalanceRef.current = balance;
      lockedTomanBalanceRef.current = locked;
      persistBalanceShell(currentBalanceRef.current, balance, locked);
      hasHydratedRef.current = true;
      setHasHydrated(true);
    } catch (err) {
      console.warn("[Wallet] refreshWalletBalances failed", err);
    }
  }, [persistBalanceShell]);

  const fetchBalances = useCallback(
    async (options?: RefreshBalancesOptions) => {
      if (isHardExiting()) return;
      if (fetchInFlightRef.current) return;

      const force = options?.force === true;
      const shell = readBalanceShell();
      if (
        !force &&
        hasHydratedRef.current &&
        isBalanceShellFresh(
          shell ?? {
            dingBalance: 0,
            tomanBalance: 0,
            lockedTomanBalance: 0,
            fetchedAt: lastFetchedAtRef.current,
          },
          BALANCE_SHELL_TTL_MS
        )
      ) {
        console.log("[Wallet] TTL skip — cache still fresh");
        return;
      }

      fetchInFlightRef.current = true;
      if (options?.userInitiated) setIsRefreshing(true);
      if (!hasHydratedRef.current) setError(null);

      try {
        console.log("[Wallet] fetchBalances", { force, silent: !force && hasHydratedRef.current });

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          console.warn("[Wallet] No user found:", userError);
          if (isMountedRef.current) {
            setError("کاربر پیدا نشد");
            if (!hasHydratedRef.current) {
              applyBalances(0, 0, 0);
            }
          }
          return;
        }

        const { data: walletData, error: walletError } = await supabase
          .from("wallets")
          .select("balance, locked_amount")
          .eq("user_id", user.id)
          .single();

        let balance = 0;
        let locked = 0;

        if (walletError) {
          if (walletError.code !== "PGRST116") {
            console.error("[Wallet] Error fetching wallet:", walletError);
          }
        } else {
          balance =
            Number((walletData as { balance?: number })?.balance ?? 0) || 0;
          locked =
            Number((walletData as { locked_amount?: number })?.locked_amount ?? 0) ||
            0;
        }

        let ding = currentBalanceRef.current;

        if (skipDingBalanceRef.current) {
          if (!loggedDingSkipRef.current) {
            loggedDingSkipRef.current = true;
            console.info("[AgentPanel] Ding balance fetch skipped");
          }
        } else {
          loggedDingSkipRef.current = false;
          try {
            ding =
              (await fetchDingBalanceFromApi()).balance ??
              (await getMyDingBalance());
          } catch (dingErr) {
            console.warn("[Wallet] Ding fetch skipped (non-fatal):", dingErr);
          }
        }

        if (isMountedRef.current) {
          settledDingRef.current = ding;
          applyBalances(ding, balance, locked);
        }

        if (walletChannelRef.current) {
          supabase.removeChannel(walletChannelRef.current);
          walletChannelRef.current = null;
        }

        walletChannelRef.current = supabase
          .channel(`wallet_balance_changes_${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "wallets",
              filter: `user_id=eq.${user.id}`,
            },
            (payload) => {
              if (!isMountedRef.current) return;
              const newBalance =
                Number((payload.new as { balance?: number })?.balance ?? 0) || 0;
              const newLocked =
                Number((payload.new as { locked_amount?: number })?.locked_amount ?? 0) ||
                0;
              setTomanBalance(newBalance);
              setLockedTomanBalance(newLocked);
              currentTomanBalanceRef.current = newBalance;
              lockedTomanBalanceRef.current = newLocked;
              persistBalanceShell(
                currentBalanceRef.current,
                newBalance,
                newLocked
              );
            }
          )
          .subscribe();
      } catch (err) {
        console.error("[Wallet] Error in fetchBalances:", err);
        if (isMountedRef.current && !hasHydratedRef.current) {
          setError("خطا در دریافت موجودی");
          applyBalances(0, 0, 0);
        }
      } finally {
        fetchInFlightRef.current = false;
        if (isMountedRef.current) setIsRefreshing(false);
      }
    },
    [applyBalances, persistBalanceShell]
  );

  const refreshAllBalances = useCallback(
    async (options?: RefreshBalancesOptions): Promise<void> => {
      await fetchBalances(options);
    },
    [fetchBalances]
  );

  useEffect(() => {
    isMountedRef.current = true;

    if (initialRef.current.hasHydrated) {
      console.log("[Wallet] hydrate from shell");
      void fetchBalances();
    } else {
      void fetchBalances();
    }

    return () => {
      isMountedRef.current = false;
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      if (balanceUpdateTimeoutRef.current) {
        clearTimeout(balanceUpdateTimeoutRef.current);
        balanceUpdateTimeoutRef.current = null;
      }
    };
  }, [fetchBalances]);

  useEffect(() => {
    const skip = isAgentPanelPath(pathname) || isAgentPanelLocation();
    const leavingAgentPanel = wasAgentPanelRef.current && !skip;
    skipDingBalanceRef.current = skip;
    wasAgentPanelRef.current = skip;
    if (!leavingAgentPanel || !isMountedRef.current) return;

    loggedDingSkipRef.current = false;
    void fetchDingBalanceFromApi()
      .then(({ balance }) => {
        if (!isMountedRef.current || skipDingBalanceRef.current) return;
        setDingBalance(balance);
        currentBalanceRef.current = balance;
        persistBalanceShell(
          balance,
          currentTomanBalanceRef.current,
          lockedTomanBalanceRef.current
        );
      })
      .catch(() => {});
  }, [pathname, persistBalanceShell]);

  useEffect(() => {
    const onHardExit = () => {
      clearBalanceShell();
      setDingBalance(0);
      setTomanBalance(0);
      setLockedTomanBalance(0);
      setHasHydrated(false);
      setIsRefreshing(false);
      setError(null);
      hasHydratedRef.current = false;
      lastFetchedAtRef.current = 0;
      currentBalanceRef.current = 0;
      currentTomanBalanceRef.current = 0;
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

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (!isMountedRef.current || isHardExiting()) return;

      if (event === "INITIAL_SESSION") {
        const shell = readBalanceShell();
        if (
          shell &&
          hasHydratedRef.current &&
          isBalanceShellFresh(shell, BALANCE_SHELL_TTL_MS)
        ) {
          console.log("[Wallet] INITIAL_SESSION skip — balance shell still fresh");
          return;
        }
        void fetchBalances();
        return;
      }

      if (event === "SIGNED_IN") {
        void fetchBalances();
        return;
      }

      if (event === "SIGNED_OUT") {
        onHardExit();
      }
    });

    return () => {
      window.removeEventListener(HARD_EXIT_EVENT, onHardExit);
      if (walletChannelRef.current) {
        supabase.removeChannel(walletChannelRef.current);
        walletChannelRef.current = null;
      }
      data?.subscription?.unsubscribe();
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
  }, [fetchBalances]);

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

  const triggerDingCelebrate = () => {
    if (!isMountedRef.current) return;
    if (isDingEnabled()) {
      void playDingTone();
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    setIsAnimating(true);
    animationTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsAnimating(false);
      animationTimeoutRef.current = null;
    }, 800);
  };

  const clearLiveDingRevealSideEffects = useCallback(() => {
    if (balanceUpdateTimeoutRef.current) {
      clearTimeout(balanceUpdateTimeoutRef.current);
      balanceUpdateTimeoutRef.current = null;
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  const setLiveDingSettleMode = useCallback(
    (mode: DingSettleMode) => {
      liveDingSettleModeRef.current = mode;
      if (mode === "room_level") {
        clearLiveDingRevealSideEffects();
      }
    },
    [clearLiveDingRevealSideEffects]
  );

  const applySettledDingBalance = useCallback(
    (balance: number) => {
      if (!isMountedRef.current) return;
      const safeBalance = Number(balance) || 0;
      const prevBalance = currentBalanceRef.current;
      settledDingRef.current = safeBalance;
      currentBalanceRef.current = safeBalance;
      setDingBalance(safeBalance);
      persistBalanceShell(
        safeBalance,
        currentTomanBalanceRef.current,
        lockedTomanBalanceRef.current
      );
      hasHydratedRef.current = true;
      setHasHydrated(true);
      if (safeBalance > prevBalance) {
        triggerDingCelebrate();
      }
    },
    [persistBalanceShell]
  );

  const creditDingOnReveal = (
    revealKey: string,
    delta: number,
    dingSettleMode?: DingSettleMode
  ) => {
    const mode = dingSettleMode ?? liveDingSettleModeRef.current;
    if (!canApplyLiveDingRevealCredit(resolveDingSettleMode(mode))) {
      return;
    }
    if (!revealKey || delta <= 0) return;
    if (creditedRevealKeysRef.current.has(revealKey)) return;
    creditedRevealKeysRef.current.add(revealKey);

    const prevBalance = currentBalanceRef.current;
    currentBalanceRef.current = prevBalance + delta;
    const nextBalance = currentBalanceRef.current;

    console.log("[dingReveal] credit", {
      revealKey,
      delta,
      prevBalance,
      nextBalance,
    });

    const COIN_ANIMATION_DELAY = 400;
    if (balanceUpdateTimeoutRef.current) {
      clearTimeout(balanceUpdateTimeoutRef.current);
    }
    balanceUpdateTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      const latestBalance = currentBalanceRef.current;
      setDingBalance(latestBalance);
      persistBalanceShell(
        latestBalance,
        currentTomanBalanceRef.current,
        lockedTomanBalanceRef.current
      );
      hasHydratedRef.current = true;
      setHasHydrated(true);

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
    loading: !hasHydrated,
    hasHydrated,
    isRefreshing,
    error,
    isAnimating,
    isTomanAnimating,
    triggerTomanCelebrate,
    triggerDingCelebrate,
    refreshWalletBalances,
    refreshAllBalances,
    creditDingOnReveal,
    setLiveDingSettleMode,
    applySettledDingBalance,
    scheduleWalletBalanceSync,
  };
}
