"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  min_tickets_per_player: number | null;
  max_tickets_per_player: number | null;
  table_size_mode: string | null;
  table_size_fixed: number | null;
  table_size_min: number | null;
  table_size_max: number | null;
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

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/player/tournaments"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setOnBackClick, setShowBackButton]);

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

    const load = async () => {
      if (!tournamentId) {
        setError("شناسه تورنومنت نامعتبر است");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const [{ data, error }, { data: entriesData, error: entriesErr }] = await Promise.all([
        supabase
          .from("tournaments")
          .select(
            "id,title,status,start_at,currency,ticket_price,guaranteed_prize,min_tickets_per_player,max_tickets_per_player,table_size_mode,table_size_fixed,table_size_min,table_size_max"
          )
          .eq("id", tournamentId)
          .single(),
        supabase
          .from("tournament_entries")
          .select("id,user_id,tickets_count,users:users(username,email)")
          .eq("tournament_id", tournamentId)
          .eq("status", "created"),
      ]);
      if (!active) return;
      if (error || entriesErr) {
        setError(error?.message || entriesErr?.message || "خطا در دریافت اطلاعات تورنومنت");
        setTournament(null);
        setEntries([]);
      } else {
        setTournament((data as TournamentRow) ?? null);
        setEntries(((entriesData as any) ?? []) as typeof entries);
      }
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, [tournamentId]);

  useEffect(() => {
    const shouldShowWinner =
      tournament?.status === "finished" || tournament?.status === "settling";

    if (!tournament?.id || !shouldShowWinner) {
      setWinners([]);
      return;
    }

    let active = true;

    const resolveWinnerName = (row: any) =>
      row?.users?.username || row?.users?.email || row?.user_id || "بازیکن";

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
  }, [tournament?.id, tournament?.status]);

  useEffect(() => {
    if (!tournamentId) return;

    let active = true;
    const ticketPrice = tournament?.ticket_price ?? 0;

    const loadTables = async () => {
      setTablesLoading(true);
      try {
        const { data: roundRooms, error: roundErr } = await supabase
          .from("tournament_round_rooms")
          .select("room_id, round_no, table_no")
          .eq("tournament_id", tournamentId)
          .not("room_id", "is", null)
          .order("round_no", { ascending: false })
          .order("table_no", { ascending: true });

        if (roundErr || !roundRooms || roundRooms.length === 0) {
          if (active) {
            setTournamentTables([]);
          }
          return;
        }

        const roomIds = roundRooms
          .map((row: any) => row.room_id)
          .filter(Boolean) as string[];

        if (roomIds.length === 0) {
          if (active) {
            setTournamentTables([]);
          }
          return;
        }

        const { data: assignments, error: assignmentsErr } = await supabase
          .from("tournament_round_assignments")
          .select("room_id, user_id, cards_count")
          .eq("tournament_id", tournamentId)
          .in("room_id", roomIds);

        if (assignmentsErr) {
          console.error("load tournament tables assignments error:", assignmentsErr);
          if (active) {
            setTournamentTables([]);
          }
          return;
        }

        const roomStats = new Map<
          string,
          {
            players: Set<string>;
            cards: number;
          }
        >();

        assignments?.forEach((row: any) => {
          const roomId = row.room_id as string | null;
          if (!roomId) return;
          if (!roomStats.has(roomId)) {
            roomStats.set(roomId, { players: new Set(), cards: 0 });
          }
          const stats = roomStats.get(roomId)!;
          if (row.user_id) {
            stats.players.add(row.user_id as string);
          }
          stats.cards += Number(row.cards_count || 0);
        });

        const mappedTables: ActiveTable[] = roundRooms.map((row: any) => {
          const roomId = row.room_id as string;
          const stats = roomStats.get(roomId) || { players: new Set(), cards: 0 };
          const cardCount = stats.cards;
          return {
            id: roomId,
            prize: Number(ticketPrice) * cardCount,
            players: stats.players.size,
            cardCount,
          };
        });

        if (active) {
          setTournamentTables(mappedTables);
        }
      } catch (err) {
        console.error("load tournament tables error:", err);
        if (active) {
          setTournamentTables([]);
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
  }, [tournamentId, tournament?.ticket_price]);

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
  const prizeLabel =
    tournament?.guaranteed_prize != null
      ? `${tournament.guaranteed_prize.toLocaleString("fa-IR")}`
      : "-";
  const hasGuarantee = (tournament?.guaranteed_prize ?? 0) > 0;
  const buyInLabel = `${price.toLocaleString("fa-IR")}`;
  const playersCount = entries?.length ?? 0;
  const playersLabel = playersCount.toLocaleString("fa-IR");

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
        p_currency: currency,
        p_entry_id: entryId,
      });
      if (holdErr) {
        toast.error(holdErr.message || "خطا در هولد مبلغ");
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
          p_currency: currency,
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
    setEntries(((data as any) ?? []) as typeof entries);
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
      const { error: relErr } = await supabase.rpc("fn_tournament_wallet_release", {
        p_tournament_id: tournament.id,
        p_entry_id: userEntry.id,
        p_currency: currency,
      });
      if (relErr) {
        toast.error(relErr.message || "خطا در آزادسازی مبلغ");
        return;
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
        title: e.users?.username || e.users?.email || "بازیکن",
        count: Math.max(1, e.tickets_count ?? 1),
      }));
    }
    // بدون ثبت‌نام، لیست را خالی نگه دار تا حالت خالی نمایش داده شود
    return [];
  }, [entries, tournament]);

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
              جایزه کل {hasGuarantee ? "(گارانتی)" : ""}
            </span>
            <span className="text-amber-300 font-semibold">{prizeLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">(Buy-in) ورودی</span>
            <span className="text-gray-100 font-semibold">{buyInLabel}</span>
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
            disabled={submitting || !tournament || remainingQty <= 0}
            onConfirm={handleRegister}
            actionLabel={submitting ? "در حال ثبت..." : undefined}
            secondaryActionLabel={currentEntry ? (submitting ? "در حال لغو..." : "لغو خرید") : undefined}
            secondaryDisabled={submitting}
            onSecondaryAction={currentEntry ? handleCancelRegister : undefined}
          />
        )}

        <TournamentActiveCardsStatus
          cards={previewCards}
          secondsRemaining={startCountdown}
          useLongCountdown
        />

        <ActiveTablesSection
          tables={tournamentTables}
          emptyMessage={tablesLoading ? "در حال بارگذاری..." : "هیچ بازی فعالی وجود ندارد"}
          onTableClick={handleTableClick}
        />

      </div>
    </div>
  );
}
