"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { supabase } from "@/lib/supabaseClient";
import TournamentBuyPanel from "@/components/tournament/TournamentBuyPanel";
import WatchInviteShareButton from "@/components/tournament/WatchInviteShareButton";
import WatchInviteGuestPanel from "@/components/tournament/WatchInviteGuestPanel";
import WatchInviteGuestLiveBlockModal from "@/components/tournament/WatchInviteGuestLiveBlockModal";
import { buildWatchInvitePath } from "@/lib/watch-invite/buildWatchLink";
import TournamentActiveCardsStatus, { TournamentActiveCardStatus } from "@/components/tournament/TournamentActiveCardsStatus";
import ActiveTablesSection from "@/components/room/ActiveTablesSection";
import { ActiveTable } from "@/components/ActiveTablesPanel";
import type { WatchTournamentSnapshot } from "@/lib/watch-invite/types";
import toast from "react-hot-toast";
import TournamentRoomLoadingFallback from "@/components/TournamentRoomLoadingFallback";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import loadingStyles from "@/components/playerScreenLoading.module.css";
import screenStyles from "@/src/screens/TournamentRoomScreen.module.css";

interface TournamentRoomScreenProps {
  tournamentId?: string;
  roomId?: string; // reserved for future use
  templateId?: string; // reserved for future use
  mode?: "player" | "guest";
  watchCode?: number;
  inviteToken?: string;
  guestSignupPath?: string;
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
  later_round_table_size_mode?: string | null;
  later_round_table_size_fixed?: number | null;
  later_round_table_size_min?: number | null;
  later_round_table_size_max?: number | null;
  meta?: {
    final_winners_count?: number | null;
    min_players_to_start?: number | null;
    entry_currency?: string | null;
    break_between_rounds_minutes?: number | null;
    round_break_ends_at?: string | null;
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

export default function TournamentRoomScreen({
  tournamentId,
  mode = "player",
  watchCode,
  inviteToken,
  guestSignupPath,
}: TournamentRoomScreenProps) {
  const isGuestMode = mode === "guest";
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
  const [roundBreakEndsAt, setRoundBreakEndsAt] = useState<string | null>(null);
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [winners, setWinners] = useState<
    {
      userId: string;
      name: string;
      rank: number | null;
      amount: number | null;
    }[]
  >([]);
  const [dingLeaderboardLoading, setDingLeaderboardLoading] = useState(false);
  const [dingLeaderboard, setDingLeaderboard] = useState<
    {
      userId: string;
      name: string;
      rank: number;
      dingTotal: number;
    }[]
  >([]);
  const [entries, setEntries] = useState<
    {
      id: string;
      user_id: string;
      tickets_count: number | null;
      status?: string | null;
      users?: { username?: string | null; email?: string | null } | null;
    }[]
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [globalRegistrationLocked, setGlobalRegistrationLocked] = useState(false);
  const [globalRegistrationLockReason, setGlobalRegistrationLockReason] = useState<string | null>(null);
  const [profileNamesByUserId, setProfileNamesByUserId] = useState<Record<string, string>>({});
  const [guestPlayerCount, setGuestPlayerCount] = useState(0);
  const [guestTotalTickets, setGuestTotalTickets] = useState(0);
  const [guestActiveCards, setGuestActiveCards] = useState<TournamentActiveCardStatus[]>([]);
  const [guestLiveModalOpen, setGuestLiveModalOpen] = useState(false);

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
    if (isGuestMode) {
      setShowBackButton(false);
      setOnBackClick(null);
      return () => {
        setShowBackButton(false);
        setOnBackClick(null);
      };
    }

    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/tournaments"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [isGuestMode, router, setOnBackClick, setShowBackButton]);

  const mapSnapshotToTournament = useCallback((snapshot: WatchTournamentSnapshot): TournamentRow => {
    return {
      id: tournamentId || String(snapshot.watchCode),
      title: snapshot.title,
      status: snapshot.status,
      start_at: snapshot.startAt,
      currency: snapshot.entryCurrency,
      ticket_price: snapshot.ticketPrice,
      guaranteed_prize: snapshot.guaranteedPrize,
      commission_rate: snapshot.commissionRate,
      min_tickets_per_player: snapshot.minTicketsPerPlayer,
      max_tickets_per_player: snapshot.maxTicketsPerPlayer,
      table_size_mode: snapshot.tableSizeMode,
      table_size_fixed: snapshot.tableSizeFixed,
      table_size_min: snapshot.tableSizeMin,
      table_size_max: snapshot.tableSizeMax,
      later_round_table_size_mode: snapshot.laterRoundTableSizeMode,
      later_round_table_size_fixed: snapshot.laterRoundTableSizeFixed,
      later_round_table_size_min: snapshot.laterRoundTableSizeMin,
      later_round_table_size_max: snapshot.laterRoundTableSizeMax,
      meta: {
        final_winners_count: snapshot.finalWinnersCount,
        min_players_to_start: snapshot.minPlayersToStart,
        entry_currency: snapshot.entryCurrency,
        round_break_ends_at: snapshot.roundBreakEndsAt,
      },
    };
  }, [tournamentId]);

  const loadGuestSnapshot = useCallback(
    async (showLoader: boolean) => {
      if (!watchCode) {
        setError("لینک تماشا نامعتبر است");
        setLoading(false);
        return;
      }

      if (showLoader) {
        setLoading(true);
      }
      setError(null);

      try {
        const res = await fetch(`/api/watch/tournament/${watchCode}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError("تورنومنت یافت نشد");
          setTournament(null);
          setTournamentTables([]);
          return;
        }

        const snapshot = (await res.json()) as WatchTournamentSnapshot;
        setTournament(mapSnapshotToTournament(snapshot));
        setGuestPlayerCount(snapshot.playerCount);
        setGuestTotalTickets(snapshot.totalTickets);
        setGuestActiveCards(
          (snapshot.activeCards || []).map((card) => ({
            id: card.id,
            title: card.label,
            count: card.count,
          }))
        );
        setRoundBreakEndsAt(snapshot.roundBreakEndsAt);
        setCurrentRoundNo(snapshot.currentRoundNo);
        setTournamentTables(
          (snapshot.tables || []).map((table) => ({
            id: table.id,
            prize: table.prize,
            players: table.players,
            cardCount: table.cardCount,
            roundNo: table.roundNo,
            tableNo: table.tableNo,
            isFinished: table.isFinished,
            status: table.status ?? null,
          }))
        );
        setEntries([]);
        setProfileNamesByUserId({});
      } catch (err) {
        console.error("[WatchInvite] guest snapshot error:", err);
        setError("خطا در دریافت اطلاعات تورنومنت");
      } finally {
        if (showLoader) {
          setLoading(false);
        }
      }
    },
    [mapSnapshotToTournament, watchCode]
  );

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
            "id,title,status,start_at,currency,ticket_price,guaranteed_prize,commission_rate,min_tickets_per_player,max_tickets_per_player,table_size_mode,table_size_fixed,table_size_min,table_size_max,later_round_table_size_mode,later_round_table_size_fixed,later_round_table_size_min,later_round_table_size_max,meta"
          )
          .eq("id", tournamentId)
          .single(),
        supabase
          .from("tournament_entries")
          .select("id,user_id,tickets_count,status,users:users(username,email)")
          .eq("tournament_id", tournamentId)
          .in("status", ["created", "settled"]),
      ]);

      if (error || entriesErr) {
        setError(error?.message || entriesErr?.message || "خطا در دریافت اطلاعات تورنومنت");
        setTournament(null);
        setEntries([]);
        setProfileNamesByUserId({});
      } else {
        const row = (data as TournamentRow) ?? null;
        setTournament(row);
        const breakEnds =
          typeof row?.meta?.round_break_ends_at === "string"
            ? row.meta.round_break_ends_at
            : null;
        setRoundBreakEndsAt(breakEnds);
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
      if (isGuestMode) {
        setCurrentUserId(null);
        return;
      }
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (!error && data?.user) {
        setCurrentUserId(data.user.id);
      }
    };
    void fetchUser();

    const loadGlobalLockState = async () => {
      if (isGuestMode) {
        setGlobalRegistrationLocked(false);
        setGlobalRegistrationLockReason(null);
        return;
      }
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

    if (isGuestMode) {
      void Promise.all([loadGuestSnapshot(true), loadGlobalLockState()]);
      const refreshInterval = setInterval(() => {
        void Promise.all([loadGuestSnapshot(false), loadGlobalLockState()]);
      }, 10000);
      return () => {
        active = false;
        clearInterval(refreshInterval);
      };
    }

    void Promise.all([loadTournamentAndEntries(true), loadGlobalLockState()]);

    const refreshInterval = setInterval(() => {
      void Promise.all([loadTournamentAndEntries(false), loadGlobalLockState()]);
    }, 10000);

    return () => {
      active = false;
      clearInterval(refreshInterval);
    };
  }, [isGuestMode, loadGuestSnapshot, loadTournamentAndEntries]);

  useEffect(() => {
    if (isGuestMode) return;

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
  }, [isGuestMode, pickHumanName, tournament?.id, tournament?.status]);

  useEffect(() => {
    if (isGuestMode) return;

    const shouldShowLeaderboard =
      tournament?.status === "finished" || tournament?.status === "settling";

    if (!tournament?.id || !shouldShowLeaderboard) {
      setDingLeaderboard([]);
      return;
    }

    let active = true;

    const loadDingLeaderboard = async () => {
      setDingLeaderboardLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token || null;
        const search = new URLSearchParams({ tournamentId: tournament.id });
        const res = await fetch(
          `/api/player/tournament-ding-leaderboard?${search.toString()}`,
          {
            method: "GET",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            cache: "no-store",
          }
        );

        if (!res.ok) {
          if (active) setDingLeaderboard([]);
          return;
        }

        const payload = (await res.json()) as {
          leaderboard?: Array<{
            userId?: string;
            name?: string;
            rank?: number;
            dingTotal?: number;
          }>;
        };

        const mapped = (payload.leaderboard || []).map((row) => ({
          userId: row.userId || "",
          name: pickHumanName(row.name),
          rank: row.rank ?? 0,
          dingTotal: row.dingTotal != null ? Number(row.dingTotal) : 0,
        }));

        if (active) setDingLeaderboard(mapped);
      } catch (err) {
        console.error("[Tournament] load ding leaderboard error", err);
        if (active) setDingLeaderboard([]);
      } finally {
        if (active) setDingLeaderboardLoading(false);
      }
    };

    void loadDingLeaderboard();
    return () => {
      active = false;
    };
  }, [isGuestMode, pickHumanName, tournament?.id, tournament?.status]);

  useEffect(() => {
    if (isGuestMode || !tournamentId) return;

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
          roundBreakEndsAt?: string | null;
        };

        if (active) {
          setTournamentTables(Array.isArray(payload.tables) ? payload.tables : []);
          if (typeof payload.roundBreakEndsAt !== "undefined") {
            setRoundBreakEndsAt(payload.roundBreakEndsAt ?? null);
          }
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
  }, [isGuestMode, tournamentId, tournament?.status]);

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
  const playersCount = isGuestMode ? guestPlayerCount : (entries?.length ?? 0);
  const normalizeCommissionRate = (value: number | null | undefined) => {
    if (value == null || Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return value / 100;
    return value;
  };
  const commissionRate = normalizeCommissionRate(tournament?.commission_rate ?? 0);
  const hasGuarantee = guaranteedPrize > 0;
  const totalTickets = useMemo(() => {
    if (isGuestMode) return guestTotalTickets;
    return entries.reduce((sum, entry) => sum + (entry.tickets_count ?? 0), 0);
  }, [entries, guestTotalTickets, isGuestMode]);
  const prizePoolGross = entryCurrency === "DING" ? 0 : price * totalTickets;
  const prizePoolNet = Math.max(0, prizePoolGross * (1 - commissionRate));
  // Display: guaranteed tournaments show guarantee while pool is below it.
  // Guarantee is armed at start once min_players_to_start is met.
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

  // Countdown: registration start_at, or inter-round break end (same timer slot).
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    const compute = () => {
      const now = Date.now();
      const status = tournament?.status ?? null;
      if (status === "finished" || status === "settling") {
        setStartCountdown(0);
        return;
      }
      const startMs = tournament?.start_at
        ? new Date(tournament.start_at).getTime()
        : NaN;
      if (Number.isFinite(startMs) && startMs > now) {
        setStartCountdown(Math.max(0, Math.floor((startMs - now) / 1000)));
        return;
      }
      const breakMs = roundBreakEndsAt
        ? new Date(roundBreakEndsAt).getTime()
        : NaN;
      if (Number.isFinite(breakMs) && breakMs > now) {
        setStartCountdown(Math.max(0, Math.floor((breakMs - now) / 1000)));
        return;
      }
      setStartCountdown(0);
    };
    compute();
    timer = setInterval(() => {
      compute();
    }, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [tournament?.start_at, tournament?.status, roundBreakEndsAt]);

  const formatTableSizePhase = (
    mode: string | null | undefined,
    fixed: number | null | undefined,
    min: number | null | undefined,
    max: number | null | undefined
  ) => {
    if (mode === "fixed" && fixed) return `${fixed} نفره`;
    if (mode === "range") {
      const minLabel = min ?? "?";
      const maxLabel = max ?? "?";
      return `${minLabel} تا ${maxLabel} نفر`;
    }
    return mode || "-";
  };

  const tableSizeLabel = useMemo(() => {
    if (!tournament) return "-";
    const round1 = formatTableSizePhase(
      tournament.table_size_mode,
      tournament.table_size_fixed,
      tournament.table_size_min,
      tournament.table_size_max
    );
    const hasLaterSettings =
      tournament.later_round_table_size_mode != null ||
      tournament.later_round_table_size_fixed != null ||
      tournament.later_round_table_size_min != null ||
      tournament.later_round_table_size_max != null;
    if (!hasLaterSettings) return round1;
    const later = formatTableSizePhase(
      tournament.later_round_table_size_mode ?? tournament.table_size_mode,
      tournament.later_round_table_size_fixed ?? tournament.table_size_fixed,
      tournament.later_round_table_size_min ?? tournament.table_size_min,
      tournament.later_round_table_size_max ?? tournament.table_size_max
    );
    return `راند ۱: ${round1} | بعد: ${later}`;
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
      .select("id,user_id,tickets_count,status,users:users(username,email)")
      .eq("tournament_id", tournament.id)
      .in("status", ["created", "settled"]);
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
    const userEntry = entries.find(
      (e) =>
        e.user_id === currentUserId &&
        (e.status == null || e.status === "created")
    );
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
    if (isGuestMode) return guestActiveCards;
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
  }, [entries, guestActiveCards, isGuestMode, pickHumanName, profileNamesByUserId, tournament]);

  const currentEntry = useMemo(
    () =>
      entries.find(
        (e) =>
          currentUserId &&
          e.user_id === currentUserId &&
          (e.status == null || e.status === "created")
      ),
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
    if (isGuestMode) return;
    if (!tournamentId) return;
    console.info("[Tournament] Open table room", {
      roomId,
      tournamentId,
      spectate: true,
    });
    const params = new URLSearchParams({
      roomId,
      spectate: "1",
      tournamentId,
    });
    router.push(`/player/gameroom?${params.toString()}`);
  };

  const handleGuestTableClick = useCallback(
    (roomId: string) => {
      const table = tournamentTables.find((row) => row.id === roomId);
      if (!table) return;
      if (table.isFinished) {
        if (!watchCode || !inviteToken) return;
        router.push(buildWatchInvitePath(watchCode, inviteToken, roomId));
        return;
      }
      setGuestLiveModalOpen(true);
    },
    [inviteToken, router, tournamentTables, watchCode]
  );

  const isRegistrationOpen = tournament?.status === "registration_open";
  const isTournamentEnded =
    tournament?.status === "finished" || tournament?.status === "settling";
  const nowMs = Date.now();
  const startMs = tournament?.start_at
    ? new Date(tournament.start_at).getTime()
    : NaN;
  const breakMs = roundBreakEndsAt
    ? new Date(roundBreakEndsAt).getTime()
    : NaN;
  const countdownKind: "tournament_start" | "round_break" | null =
    isTournamentEnded
      ? null
      : Number.isFinite(startMs) && startMs > nowMs
        ? "tournament_start"
        : Number.isFinite(breakMs) && breakMs > nowMs
          ? "round_break"
          : null;
  const tablesEmptyMessage = tablesLoading
    ? "در حال بارگذاری..."
    : isTournamentEnded
      ? "میزی برای نمایش وجود ندارد"
      : "هیچ بازی فعالی وجود ندارد";

  const shareTournamentId = tournamentId ?? tournament?.id ?? null;

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
            onClick={() => router.push(isGuestMode ? guestSignupPath || "/signup" : "/player/tournaments")}
            className={screenStyles.errorBackButton}
          >
            {isGuestMode ? "ثبت‌نام" : "بازگشت به لیست تورنومنت‌ها"}
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
          <div className={screenStyles.infoRow}>
            <span className={screenStyles.infoLabel}>سایز میز</span>
            <span className={screenStyles.infoValueDefault}>{tableSizeLabel}</span>
          </div>
        </div>

        {isGuestMode && guestSignupPath ? (
          <WatchInviteGuestPanel signupPath={guestSignupPath} />
        ) : null}

        {!isGuestMode && shareTournamentId ? (
          <WatchInviteShareButton
            tournamentId={shareTournamentId}
            tournamentTitle={tournament?.title}
          />
        ) : null}

        {(tournament?.status === "finished" || tournament?.status === "settling") && !isGuestMode && (
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

        {(tournament?.status === "finished" || tournament?.status === "settling") && !isGuestMode && (
          <div className={`${panelStyles.panelSurface} ${screenStyles.dingRankPanel}`}>
            <div className={screenStyles.dingRankTitle}>رتبه‌بندی DING</div>
            {dingLeaderboardLoading ? (
              <div className={screenStyles.dingRankLoading}>در حال دریافت رتبه‌بندی...</div>
            ) : dingLeaderboard.length === 0 ? (
              <div className={screenStyles.dingRankEmpty}>رتبه‌بندی DING ثبت نشده است.</div>
            ) : (
              <div className={screenStyles.dingRankList}>
                {dingLeaderboard.map((entry, index) => (
                  <div
                    key={`${entry.userId}-${index}`}
                    className={screenStyles.dingRankRow}
                  >
                    <div className="flex items-center gap-2">
                      <span className={screenStyles.dingRankNumber}>
                        {entry.rank}.
                      </span>
                      <span>{entry.name}</span>
                    </div>
                    <span
                      className={screenStyles.dingRankTotal}
                      dir="ltr"
                    >
                      {entry.dingTotal.toLocaleString("en-US")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isRegistrationOpen && !isGuestMode && (
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
          countdownKind={countdownKind}
          useLongCountdown
          tournamentStatus={tournament?.status ?? null}
          currentRoundNo={currentRoundNo}
          waitingListMessage={
            isTournamentEnded
              ? "ثبت‌نام این تورنومنت به پایان رسیده است"
              : undefined
          }
        />

        <ActiveTablesSection
          title="میزهای تورنومنت"
          titleClassName={panelStyles.activeTablesTitleGreen}
          tables={tournamentTables}
          emptyMessage={tablesEmptyMessage}
          onTableClick={isGuestMode ? handleGuestTableClick : handleTableClick}
          hideWinnerNames={isGuestMode}
        />

        {isGuestMode && guestSignupPath ? (
          <WatchInviteGuestLiveBlockModal
            open={guestLiveModalOpen}
            signupPath={guestSignupPath}
            onClose={() => setGuestLiveModalOpen(false)}
          />
        ) : null}

      </div>
    </div>
  );
}
