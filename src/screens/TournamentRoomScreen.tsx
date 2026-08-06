"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { supabase } from "@/lib/supabaseClient";
import TournamentBuyPanel from "@/components/tournament/TournamentBuyPanel";
import TournamentActiveCardsStatus, { TournamentActiveCardStatus } from "@/components/tournament/TournamentActiveCardsStatus";
import ActiveTablesSection from "@/components/room/ActiveTablesSection";
import { ActiveTable } from "@/components/ActiveTablesPanel";
import toast from "react-hot-toast";
import TournamentRoomLoadingFallback from "@/components/TournamentRoomLoadingFallback";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import loadingStyles from "@/components/playerScreenLoading.module.css";
import screenStyles from "@/src/screens/TournamentRoomScreen.module.css";

interface TournamentRoomScreenProps {
  tournamentId?: string;
  roomId?: string; // reserved for future use
  templateId?: string; // reserved for future use
}

type TournamentRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_at: string | null;
  currency: string | null;
  ticket_price: number | null;
  guaranteed_prize: number | null;
  commission_rate: number | null;
  min_tickets_per_player: number | null;
  max_tickets_per_player: number | null;
  table_size_mode: string | null;
  table_size_fixed: number | null;
  table_size_min: number | null;
  table_size_max: number | null;
  meta?: {
    final_winners_count?: number | null;
    min_players_for_guarantee?: number | null;
    entry_currency?: string | null;
  } | null;
};

const statusLabel = (status: string | null) => {
  switch (status) {
    case "registration_open":
      return "ثبت‌نام باز";
    case "running":
      return "در حال اجرا";
    case "settling":
      return "در حال تسویه";
    case "finished":
      return "پایان‌یافته";
    case "draft":
      return "پیش‌نویس";
    default:
      return status || "-";
  }
};

export default function TournamentRoomScreen({ tournamentId }: TournamentRoomScreenProps) {
  const router = useRouter();
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { refreshWalletBalances } = useBalancesContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [startCountdown, setStartCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [tournamentTables, setTournamentTables] = useState<ActiveTable[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [currentRoundNo, setCurrentRoundNo] = useState<number | null>(null);
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [winners, setWinners] = useState<
    {
      userId: string;
      name: string;
      rank: number | null;
      amount: number | null;
    }[]
  >([]);
  const [entries, setEntries] = useState<
    {
      id: string;
      user_id: string;
      tickets_count: number | null;
      users?: { username?: string | null; email?: string | null } | null;
    }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [globalRegistrationLocked, setGlobalRegistrationLocked] = useState(false);
  const [globalRegistrationLockReason, setGlobalRegistrationLockReason] = useState<string | null>(null);
  const [profileNamesByUserId, setProfileNamesByUserId] = useState<Record<string, string>>({});

  const isUuidLike = useCallback((value: string | null | undefined) => {
    if (!value) return false;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim()
    );
  }, []);

  const pickHumanName = useCallback(
    (...candidates: Array<string | null | undefined>) => {
      for (const candidate of candidates) {
        const value = candidate?.trim();
        if (!value) continue;
        if (isUuidLike(value)) continue;
        return value;
      }
      return "بازیکن";
    },
    [isUuidLike]
  );

  const loadProfileNames = useCallback(async () => {
    if (!tournamentId) {
      setProfileNamesByUserId({});
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token || null;
    const search = new URLSearchParams({ tournamentId });
    const res = await fetch(`/api/player/tournament-entry-names?${search.toString()}`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });

    if (!res.ok) {
      setProfileNamesByUserId({});
      return;
    }

    const payload = (await res.json()) as { namesByUserId?: Record<string, string> };
    setProfileNamesByUserId(payload.namesByUserId ?? {});
  }, [tournamentId]);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/tournaments"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

  const loadTournamentAndEntries = useCallback(
    async (showLoader: boolean) => {
      if (!tournamentId) {
        setError("شناسه تورنومنت نامعتبر است");
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }
      setError(null);

      const [{ data, error }, { data: entriesData, error: entriesErr }] = await Promise.all([
        supabase
          .from("tournaments")
          .select(
            "id,title,status,start_at,currency,ticket_price,guaranteed_prize,commission_rate,min_tickets_per_player,max_tickets_per_player,table_size_mode,table_size_fixed,table_size_min,table_size_max,meta"
          )
          .eq("id", tournamentId)
          .single(),
        supabase
          .from("tournament_entries")
          .select("id,user_id,tickets_count,users:users(username,email)")
          .eq("tournament_id", tournamentId)
          .eq("status", "created"),
      ]);

      if (error || entriesErr) {
        setError(error?.message || entriesErr?.message || "خطا در دریافت اطلاعات تورنومنت");
        setTournament(null);
        setEntries([]);
        setProfileNamesByUserId({});
      } else {
        setTournament((data as TournamentRow) ?? null);
        const nextEntries = (((entriesData as any) ?? []) as typeof entries);
        setEntries(nextEntries);
        void loadProfileNames();
      }

      if (showLoader) {
        setLoading(false);
      }
    },
    [loadProfileNames, tournamentId]
  );

  useEffect(() => {
    let active = true;
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (!error && data?.user) {
        setCurrentUserId(data.user.id);
      }
    };
    void fetchUser();

    const loadGlobalLockState = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        const res = await fetch("/api/player/runtime/global-registration-lock", {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        if (!active || !res.ok) return;
        const payload = (await res.json()) as {
          global_registration_locked?: boolean;
          global_registration_lock_reason?: string | null;
        };
        if (!active) return;
        setGlobalRegistrationLocked(Boolean(payload.global_registration_locked));
        setGlobalRegistrationLockReason(
          payload.global_registration_lock_reason?.trim() || null
        );
      } catch {
        if (!active) return;
        setGlobalRegistrationLocked(false);
        setGlobalRegistrationLockReason(null);
      }
    };

    void Promise.all([loadTournamentAndEntries(true), loadGlobalLockState()]);

    // Keep tournament status fresh so UI sections react immediately after state changes.
    const refreshInterval = setInterval(() => {
      void Promise.all([loadTournamentAndEntries(false), loadGlobalLockState()]);
    }, 10000);

    return () => {
      active = false;
      clearInterval(refreshInterval);
    };
  }, [loadTournamentAndEntries]);

  useEffect(() => {
    const shouldShowWinner =
      tournament?.status === "finished" || tournament?.status === "settling";

    if (!tournament?.id || !shouldShowWinner) {
      setWinners([]);
      return;
    }

    let active = true;

    const loadWinner = async () => {
      setWinnersLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        const search = new URLSearchParams({ tournamentId: tournament.id });
        const res = await fetch(
          `/api/player/tournament-winners?${search.toString()}`,
          {
            method: "GET",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: "no-store",
          }
        );

        if (!res.ok) {
          if (active) setWinners([]);
          return;
        }

        const payload = (await res.json()) as {
          winners?: Array<{
            userId?: string;
            name?: string;
            rank?: number | null;
            amount?: number | null;
          }>;
        };

        const mapped = (payload.winners || []).map((row) => ({
          userId: row.userId || "",
          name: pickHumanName(row.name),
          rank: row.rank ?? null,
          amount: row.amount != null ? Number(row.amount) : null,
        }));

        if (active) setWinners(mapped);
      } catch (err) {
        console.error("[Tournament] load winners error", err);
        if (active) setWinners([]);
      } finally {
        if (active) setWinnersLoading(false);
      }
    };

    void loadWinner();
    return () => {
      active = false;
    };
  }, [pickHumanName, tournament?.id, tournament?.status]);

  useEffect(() => {
    if (!tournamentId) return;

    const isFinished =
      tournament?.status === "finished" || tournament?.status === "settling";

    let active = true;

    const loadTables = async () => {
      setTablesLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        const search = new URLSearchParams({ tournamentId });
        const endpoint = isFinished
          ? `/api/player/tournament-finished-tables?${search.toString()}`
          : `/api/player/tournament-active-tables?${search.toString()}`;
        const res = await fetch(endpoint, {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });

        if (!res.ok) {
          if (active) {
            setTournamentTables([]);
            setCurrentRoundNo(null);
          }
          return;
        }

        const payload = (await res.json()) as {
          tables?: ActiveTable[];
          currentRoundNo?: number | null;
        };

        if (active) {
          setTournamentTables(Array.isArray(payload.tables) ? payload.tables : []);
          if (isFinished) {
            const roundNumbers = (payload.tables || [])
              .map((t) => t.roundNo)
              .filter((n): n is number => n != null);
            setCurrentRoundNo(
              roundNumbers.length > 0 ? Math.max(...roundNumbers) : null
            );
          } else {
            setCurrentRoundNo(payload.currentRoundNo ?? null);
          }
        }
      } catch (err) {
        console.error("load tournament tables error:", err);
        if (active) {
          setTournamentTables([]);
          setCurrentRoundNo(null);
        }
      } finally {
        if (active) {
          setTablesLoading(false);
        }
      }
    };

    void loadTables();
    if (isFinished) {
      return () => {
        active = false;
      };
    }

    const interval = setInterval(loadTables, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tournamentId, tournament?.status]);

  const minQty = useMemo(
    () => tournament?.min_tickets_per_player ?? 1,
    [tournament?.min_tickets_per_player]
  );
  const maxQty = useMemo(() => {
    const max = tournament?.max_tickets_per_player;
    if (max != null && max > 0) return max;
    return Math.max(minQty, 10);
  }, [tournament?.max_tickets_per_player, minQty]);

  const price = tournament?.ticket_price ?? 0;
  const currency = tournament?.currency ?? "IRR";
  const entryCurrency =
    (tournament?.meta?.entry_currency || tournament?.currency || "IRR").toString();
  const guaranteedPrize = tournament?.guaranteed_prize ?? 0;
  const playersCount = entries?.length ?? 0;
  const normalizeCommissionRate = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return value / 100;
    return value;
  };
  const commissionRate = normalizeCommissionRate(tournament?.commission_rate ?? 0);
  const hasGuarantee = guaranteedPrize > 0;
  const totalTickets = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.tickets_count ?? 0), 0),
    [entries]
  );
  const prizePoolGross = entryCurrency === "DING" ? 0 : price * totalTickets;
  const prizePoolNet = Math.max(0, prizePoolGross * (1 - commissionRate));
  // Display: guaranteed tournaments show guarantee while pool is below it.
  // min_players_for_guarantee is settlement eligibility, not this UI floor.
  const displayPrize = hasGuarantee
    ? Math.max(guaranteedPrize, prizePoolNet)
    : prizePoolNet;
  const showGuaranteeLabel = hasGuarantee && prizePoolNet < guaranteedPrize;
  const prizeLabel =
    Number.isFinite(displayPrize) && displayPrize > 0
      ? displayPrize.toLocaleString("en-US")
      : "-";
  const collectedLabel = prizePoolNet.toLocaleString("en-US");
  const buyInLabel = `${price.toLocaleString("en-US")} ${entryCurrency}`;
  const entryCurrencyLabel = entryCurrency === "DING" ? "DING" : "تومن";
  const playersLabel = playersCount.toLocaleString("en-US");
  const winnersCount =
    tournament?.meta?.final_winners_count != null
      ? Number(tournament.meta.final_winners_count)
      : 1;

  // شمارش معکوس تا زمان شروع تورنومنت
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const compute = () => {
      if (!tournament?.start_at) {
        setStartCountdown(0);
        return;
      }
      const target = new Date(tournament.start_at).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setStartCountdown(diff);
    };
    compute();
    timer = setInterval(() => {
      compute();
    }, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tournament?.start_at]);

  const tableSizeLabel = useMemo(() => {
    if (!tournament) return "-";
    if (tournament.table_size_mode === "fixed" && tournament.table_size_fixed) {
      return `${tournament.table_size_fixed} نفره`;
    }
    if (tournament.table_size_mode === "range") {
      const min = tournament.table_size_min ?? "?";
      const max = tournament.table_size_max ?? "?";
      return `${min} تا ${max} نفر`;
    }
    return tournament.table_size_mode || "-";
  }, [tournament]);

  const handleRegister = async (qty: number) => {
    if (!tournament) {
      toast.error("اطلاعات تورنومنت موجود نیست");
      return;
    }
    if (globalRegistrationLocked) {
      toast.error(
        globalRegistrationLockReason ||
          "ثبت نام در همه بازی‌ها موقتاً توسط ادمین قفل شده است."
      );
      return;
    }

    const currentCount = currentEntry?.tickets_count ?? 0;
    if (remainingQty <= 0) {
      toast.error("سقف خرید تکمیل شده است");
      return;
    }
    if (qty < 1 || qty > remainingQty) {
      toast.error(`حداکثر خرید مجاز در حال حاضر ${remainingQty} عدد است`);
      return;
    }
    const newTickets = currentCount + qty;
    const amountTotal = newTickets * price;
    const entryId = currentEntry?.id ?? null;
    setSubmitting(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr || !user) {
        toast.error("ابتدا وارد حساب کاربری شوید");
        return;
      }

      // Hold funds
      const { error: holdErr } = await supabase.rpc("fn_tournament_wallet_hold", {
        p_tournament_id: tournament.id,
        p_qty: qty,
        p_currency: entryCurrency,
        p_entry_id: entryId,
      });
      if (holdErr) {
        if ((holdErr.message || "").includes("global registration locked")) {
          toast.error(
            globalRegistrationLockReason ||
              "ثبت نام در همه بازی‌ها موقتاً توسط ادمین قفل شده است."
          );
        } else {
          toast.error(holdErr.message || "خطا در هولد مبلغ");
        }
        return;
      }

      const { error } = await supabase
        .from("tournament_entries")
        .upsert(
          {
            tournament_id: tournament.id,
            user_id: user.id,
            tickets_count: newTickets,
            amount: amountTotal,
            status: "created",
          },
          { onConflict: "tournament_id,user_id" }
        );

      if (error) {
        // rollback hold
        void supabase.rpc("fn_tournament_wallet_release", {
          p_tournament_id: tournament.id,
          p_entry_id: entryId,
          p_currency: entryCurrency,
        });
        toast.error(error.message || "خطا در ثبت‌نام تورنومنت");
        return;
      }

      toast.success("ثبت‌نام تورنومنت انجام شد");
      void refreshWalletBalances?.();
      void refreshEntries();
    } catch (e: any) {
      toast.error(e?.message || "خطای غیرمنتظره در ثبت‌نام");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshEntries = async () => {
    if (!tournament?.id) return;
    const { data, error } = await supabase
      .from("tournament_entries")
      .select("id,user_id,tickets_count,users:users(username,email)")
      .eq("tournament_id", tournament.id)
      .eq("status", "created");
    if (error) {
      toast.error("خطا در به‌روزرسانی لیست ثبت‌نام");
      return;
    }
    const nextEntries = (((data as any) ?? []) as typeof entries);
    setEntries(nextEntries);
    void loadProfileNames();
  };

  const handleCancelRegister = async () => {
    if (!tournament || !currentUserId) {
      toast.error("ابتدا وارد حساب کاربری شوید");
      return;
    }
    const userEntry = entries.find((e) => e.user_id === currentUserId);
    if (!userEntry) {
      toast.error("ثبت‌نامی برای لغو یافت نشد");
      return;
    }
    setSubmitting(true);
    try {
      const isFreeTournament = (tournament.ticket_price ?? 0) === 0;
      if (!isFreeTournament) {
        const { error: relErr } = await supabase.rpc("fn_tournament_wallet_release", {
          p_tournament_id: tournament.id,
          p_entry_id: userEntry.id,
          p_currency: entryCurrency,
        });
        if (relErr) {
          toast.error(relErr.message || "خطا در آزادسازی مبلغ");
          return;
        }
      }

      const { error } = await supabase
        .from("tournament_entries")
        .update({ status: "cancelled" })
        .eq("tournament_id", tournament.id)
        .eq("user_id", currentUserId);
      if (error) {
        toast.error(error.message || "خطا در لغو ثبت‌نام");
        return;
      }
      toast.success("ثبت‌نام لغو شد");
      void refreshWalletBalances?.();
      void refreshEntries();
    } catch (e: any) {
      toast.error(e?.message || "خطای غیرمنتظره در لغو");
    } finally {
      setSubmitting(false);
    }
  };

  const previewCards: TournamentActiveCardStatus[] = useMemo(() => {
    if (!tournament) return [];
    if (entries.length > 0) {
      return entries.map((e) => ({
        id: e.user_id,
        title: pickHumanName(
          profileNamesByUserId[e.user_id],
          e.users?.username,
          e.users?.email,
          e.user_id
        ),
        count: Math.max(1, e.tickets_count ?? 1),
      }));
    }
    // بدون ثبت‌نام، لیست را خالی نگه دار تا حالت خالی نمایش داده شود
    return [];
  }, [entries, pickHumanName, profileNamesByUserId, tournament]);

  const currentEntry = useMemo(
    () => entries.find((e) => currentUserId && e.user_id === currentUserId),
    [currentUserId, entries]
  );

  const remainingQty = useMemo(() => {
    const currentCount = currentEntry?.tickets_count ?? 0;
    return Math.max(0, maxQty - currentCount);
  }, [currentEntry?.tickets_count, maxQty]);

  const panelMinQty = useMemo(() => {
    if (remainingQty <= 0) return minQty;
    // اگر قبلاً ثبت‌نام دارد، اجازه افزایش حداقل از 1
    if (currentEntry) return 1;
    return Math.max(1, Math.min(minQty, remainingQty));
  }, [currentEntry, minQty, remainingQty]);

  const panelMaxQty = useMemo(() => {
    if (remainingQty <= 0) return minQty;
    return remainingQty;
  }, [remainingQty, minQty]);

  const handleTableClick = (roomId: string) => {
    router.push(`/player/gameroom?roomId=${roomId}`);
  };

  const isRegistrationOpen = tournament?.status === "registration_open";
  const isTournamentEnded =
    tournament?.status === "finished" || tournament?.status === "settling";
  const tablesEmptyMessage = tablesLoading
    ? "در حال بارگذاری..."
    : isTournamentEnded
      ? "میزی برای نمایش وجود ندارد"
      : "هیچ بازی فعالی وجود ندارد";

  if (loading) {
    return <TournamentRoomLoadingFallback />;
  }

  if (error || !tournament) {
    return (
      <div className={`${loadingStyles.page} ${loadingStyles.pageCentered} px-4`}>
        <div className={screenStyles.errorBox}>
          <div className={screenStyles.errorTitle}>
            {error || "تورنومنت یافت نشد"}
          </div>
          <button
            onClick={() => router.push("/player/tournaments")}
            className={screenStyles.errorBackButton}
          >
            بازگشت به لیست تورنومنت‌ها
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={screenStyles.root}>
      <div className={screenStyles.inner}>
        {globalRegistrationLocked && (
          <div className={screenStyles.lockBanner}>
            {globalRegistrationLockReason
              ? globalRegistrationLockReason
              : "ثبت نام در همه بازی‌ها موقتاً توسط ادمین قفل شده است."}
          </div>
        )}
        <div className={`${panelStyles.panelSurface} ${screenStyles.infoPanel}`}>
          <div className={screenStyles.infoRow}>
            <span className={screenStyles.infoTitle}>
              {tournament?.title ?? ""}
            </span>
            <div className="flex items-center gap-2 text-right">
              <span className={screenStyles.infoLabel}>بازیکن</span>
              <span className={screenStyles.infoValuePlayers}>
                {playersLabel != null ? playersLabel : "-"}
              </span>
            </div>
          </div>
          <div className={screenStyles.infoRow}>
            <span className={screenStyles.infoLabel}>
              جایزه کل {showGuaranteeLabel ? "(گارانتی)" : ""}
            </span>
            <span className={screenStyles.infoValuePrize}>{prizeLabel}</span>
          </div>
          <div className={screenStyles.infoRow}>
            <span className={screenStyles.infoLabel}>مبلغ جمع شده</span>
            <span className={screenStyles.infoValueCollected} dir="ltr">
              {collectedLabel}
            </span>
          </div>
          <div className={screenStyles.infoRow}>
            <span className={screenStyles.infoLabel}>(Buy-in) ورودی</span>
            <span className={screenStyles.infoValueDefault}>{buyInLabel}</span>
          </div>
          <div className={screenStyles.infoRow}>
            <span className={screenStyles.infoLabel}>تعداد برنده نهایی</span>
            <span className={screenStyles.infoValueWinners}>
              {Number.isFinite(winnersCount) ? winnersCount.toLocaleString("fa-IR") : "-"}
            </span>
          </div>
        </div>

        {(tournament?.status === "finished" || tournament?.status === "settling") && (
          <div className={`${panelStyles.panelSurface} ${screenStyles.winnersPanel}`}>
            <div className={screenStyles.winnersTitle}>برنده‌ها</div>
            {winnersLoading ? (
              <div className={screenStyles.winnersLoading}>در حال دریافت برنده‌ها...</div>
            ) : winners.length === 0 ? (
              <div className={screenStyles.winnersEmpty}>برنده‌ای ثبت نشده است.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {winners.map((winner, index) => (
                  <div key={`${winner.userId}-${index}`} className={screenStyles.winnerRow}>
                    <div className="flex items-center gap-2">
                      <span className={screenStyles.winnerRank}>
                        {winner.rank ?? index + 1}.
                      </span>
                      <span>{winner.name}</span>
                    </div>
                    <div className={screenStyles.winnerAmount}>
                      {winner.amount != null ? winner.amount.toLocaleString("fa-IR") : "-"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isRegistrationOpen && (
          <TournamentBuyPanel
            price={price}
            minQuantity={panelMinQty}
            maxQuantity={panelMaxQty}
            maxBuy={panelMaxQty}
            displayMin={minQty}
            displayMax={maxQty}
            initialQuantity={panelMinQty}
            disabled={submitting || !tournament || remainingQty <= 0 || globalRegistrationLocked}
            onConfirm={handleRegister}
            actionLabel={
              submitting
                ? "در حال ثبت..."
                : globalRegistrationLocked
                  ? "ثبت نام قفل است"
                  : undefined
            }
            currencyLabel={entryCurrencyLabel}
            secondaryActionLabel={currentEntry ? (submitting ? "در حال لغو..." : "لغو خرید") : undefined}
            secondaryDisabled={submitting}
            onSecondaryAction={currentEntry ? handleCancelRegister : undefined}
          />
        )}

        <TournamentActiveCardsStatus
          cards={previewCards}
          secondsRemaining={startCountdown}
          useLongCountdown
          tournamentStatus={tournament?.status ?? null}
          currentRoundNo={currentRoundNo}
        />

        <ActiveTablesSection
          title="میزهای تورنومنت"
          titleClassName={panelStyles.activeTablesTitleGreen}
          tables={tournamentTables}
          emptyMessage={tablesEmptyMessage}
          onTableClick={handleTableClick}
        />

      </div>
    </div>
  );
}
