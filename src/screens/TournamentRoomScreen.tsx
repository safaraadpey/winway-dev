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

  const entryNamesByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of entries) {
      const name = pickHumanName(
        profileNamesByUserId[entry.user_id],
        entry.users?.username,
        entry.users?.email
      );
      if (entry.user_id) map.set(entry.user_id, name);
    }
    return map;
  }, [entries, pickHumanName, profileNamesByUserId]);

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

    const resolveWinnerName = (row: any) =>
      pickHumanName(
        row?.user_id ? profileNamesByUserId[row.user_id] : null,
        row?.users?.username,
        row?.users?.email,
        row?.user_id ? entryNamesByUserId.get(row.user_id) : null,
        row?.user_id
      );

    const loadWinner = async () => {
      setWinnersLoading(true);
      try {
        const { data, error } = await supabase
          .from("tournament_payouts")
          .select("user_id, amount, rank, users:users(username,email)")
          .eq("tournament_id", tournament.id)
          .order("rank", { ascending: true });

        if (!error && data && data.length > 0) {
          const mapped = (data as any[]).map((row) => ({
            userId: row.user_id,
            name: resolveWinnerName(row),
            rank: row.rank ?? null,
            amount: row.amount != null ? Number(row.amount) : null,
          }));
          if (active) setWinners(mapped);
          return;
        }

        // Fallback: derive winner from final round room_winners
        const { data: lastRoundRows, error: lastRoundErr } = await supabase
          .from("tournament_round_rooms")
          .select("round_no")
          .eq("tournament_id", tournament.id)
          .order("round_no", { ascending: false })
          .limit(1);

        if (lastRoundErr || !lastRoundRows || lastRoundRows.length === 0) {
          if (active) setWinners([]);
          return;
        }

        const lastRoundNo = lastRoundRows[0]?.round_no;
        if (!lastRoundNo) {
          if (active) setWinners([]);
          return;
        }

        const { data: finalRooms, error: finalRoomsErr } = await supabase
          .from("tournament_round_rooms")
          .select("room_id")
          .eq("tournament_id", tournament.id)
          .eq("round_no", lastRoundNo)
          .not("room_id", "is", null);

        if (finalRoomsErr || !finalRooms || finalRooms.length === 0) {
          if (active) setWinners([]);
          return;
        }

        const roomIds = finalRooms
          .map((row: any) => row.room_id)
          .filter(Boolean) as string[];

        if (roomIds.length === 0) {
          if (active) setWinners([]);
          return;
        }

        const { data: roomWinners, error: roomWinnersErr } = await supabase
          .from("room_winners")
          .select("user_id, weight, users:users(username,email)")
          .in("room_id", roomIds);

        if (roomWinnersErr || !roomWinners || roomWinners.length === 0) {
          if (active) setWinners([]);
          return;
        }

        const uniqueWinners = new Map<string, { name: string; weight: number }>();
        (roomWinners as any[]).forEach((row) => {
          const userId = row.user_id as string | null;
          if (!userId) return;
          const weight = Number(row.weight ?? 0);
          const existing = uniqueWinners.get(userId);
          if (!existing || weight > existing.weight) {
            uniqueWinners.set(userId, { name: resolveWinnerName(row), weight });
          }
        });
        const mapped = Array.from(uniqueWinners.entries())
          .sort((a, b) => b[1].weight - a[1].weight)
          .map(([userId, info], idx) => ({
            userId,
            name: info.name,
            rank: idx + 1,
            amount: null,
          }));
        if (active) setWinners(mapped);
      } catch (err) {
        console.error("load tournament winner error:", err);
        if (active) setWinners([]);
      } finally {
        if (active) setWinnersLoading(false);
      }
    };

    void loadWinner();
    return () => {
      active = false;
    };
  }, [entryNamesByUserId, pickHumanName, profileNamesByUserId, tournament?.id, tournament?.status]);

  useEffect(() => {
    if (!tournamentId) return;
    if (tournament?.status === "finished" || tournament?.status === "settling") {
      setTournamentTables([]);
      setCurrentRoundNo(null);
      setTablesLoading(false);
      return;
    }

    let active = true;
    const ticketPrice = tournament?.ticket_price ?? 0;

    const loadTables = async () => {
      setTablesLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        const search = new URLSearchParams({ tournamentId });
        const res = await fetch(`/api/player/tournament-active-tables?${search.toString()}`, {
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
          setCurrentRoundNo(payload.currentRoundNo ?? null);
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
    const interval = setInterval(loadTables, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [tournamentId, tournament?.ticket_price, tournament?.status]);

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
  const minPlayersForGuarantee =
    tournament?.meta?.min_players_for_guarantee != null
      ? Number(tournament.meta.min_players_for_guarantee)
      : null;
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
  const guaranteeActive =
    hasGuarantee &&
    (minPlayersForGuarantee == null ||
      minPlayersForGuarantee <= 0 ||
      playersCount >= minPlayersForGuarantee);
  const displayPrize = guaranteeActive
    ? Math.max(guaranteedPrize, prizePoolNet)
    : prizePoolNet;
  const showGuaranteeLabel = guaranteeActive && prizePoolNet <= guaranteedPrize;
  const prizeLabel =
    Number.isFinite(displayPrize) && displayPrize > 0
      ? displayPrize.toLocaleString("fa-IR")
      : "-";
  const buyInLabel = `${price.toLocaleString("fa-IR")} ${entryCurrency}`;
  const entryCurrencyLabel = entryCurrency === "DING" ? "DING" : "تومن";
  const playersLabel = playersCount.toLocaleString("fa-IR");
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
  const tablesEmptyMessage =
    tournament?.status === "finished"
      ? "این تورنومنت پایان یافته است"
      : tournament?.status === "settling"
        ? "تورنومنت در حال تسویه است"
        : tablesLoading
          ? "در حال بارگذاری..."
          : "هیچ بازی فعالی وجود ندارد";

  if (loading) {
    return (
      <div className="min-h-screen bg-black/40 text-white">
        <div className="px-4 pt-4 space-y-4">
          <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="h-5 w-44 rounded-md bg-white/10" />
            <div className="h-4 w-64 rounded-md bg-white/10" />
          </div>

          <div className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="h-4 w-40 rounded-md bg-white/10" />
            <div className="space-y-2">
              <div className="h-10 rounded-xl bg-white/10" />
              <div className="h-10 rounded-xl bg-white/10" />
              <div className="h-10 rounded-xl bg-white/10" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !tournament) {
    return (
      <div className="min-h-screen bg-black/40 text-white flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-6 text-center space-y-3">
          <div className="text-lg font-semibold text-red-200">
            {error || "تورنومنت یافت نشد"}
          </div>
          <button
            onClick={() => router.push("/player/tournaments")}
            className="mt-2 rounded-xl bg-white/10 text-white px-4 py-2 hover:bg-white/20 transition"
          >
            بازگشت به لیست تورنومنت‌ها
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] bg-cover bg-center bg-no-repeat px-4 py-4">
      <div className="max-w-md mx-auto space-y-4 text-white">
        {globalRegistrationLocked && (
          <div className="rounded-xl border border-red-500/50 bg-amber-500/10 px-3 py-2 text-sm text-white text-right">
            {globalRegistrationLockReason
              ? globalRegistrationLockReason
              : "ثبت نام در همه بازی‌ها موقتاً توسط ادمین قفل شده است."}
          </div>
        )}
        <div
          className="rounded-2xl border border-transparent px-4 py-3 space-y-2 text-sm"
          style={{
            backgroundImage: `url(${require("@/src/assets/logo/TicktBuy_BG.png").default.src})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center center",
            backgroundSize: "100% 100%",
            backgroundColor: "#151A26",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-gray-200 text-sm">
              {tournament?.title ?? ""}
            </span>
            <div className="flex items-center gap-2 text-right">
              <span className="text-gray-300">بازیکن‌ها</span>
              <span className="text-emerald-300 font-semibold">
                {playersLabel != null ? playersLabel : "-"}
              </span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">
              جایزه کل {showGuaranteeLabel ? "(گارانتی)" : ""}
            </span>
            <span className="text-amber-300 font-semibold">{prizeLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">(Buy-in) ورودی</span>
            <span className="text-gray-100 font-semibold">{buyInLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">تعداد برنده نهایی</span>
            <span className="text-emerald-300 font-semibold">
              {Number.isFinite(winnersCount) ? winnersCount.toLocaleString("fa-IR") : "-"}
            </span>
          </div>
        </div>

        {(tournament?.status === "finished" || tournament?.status === "settling") && (
          <div
            className="rounded-2xl border border-transparent px-4 py-3 text-sm"
            style={{
              backgroundImage: `url(${require("@/src/assets/logo/TicktBuy_BG.png").default.src})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center center",
              backgroundSize: "100% 100%",
              backgroundColor: "#151A26",
            }}
          >
            <div className="font-semibold text-emerald-200">برنده‌ها</div>
            {winnersLoading ? (
              <div className="mt-2 text-emerald-200/70">در حال دریافت برنده‌ها...</div>
            ) : winners.length === 0 ? (
              <div className="mt-2 text-emerald-200/70">برنده‌ای ثبت نشده است.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {winners.map((winner, index) => (
                  <div key={`${winner.userId}-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-300 font-semibold">
                        {winner.rank ?? index + 1}.
                      </span>
                      <span>{winner.name}</span>
                    </div>
                    <div className="text-emerald-200">
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
          tables={tournamentTables}
          emptyMessage={tablesEmptyMessage}
          onTableClick={handleTableClick}
        />

      </div>
    </div>
  );
}
