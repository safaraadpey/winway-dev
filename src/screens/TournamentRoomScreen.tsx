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
  const [entries, setEntries] = useState<
    { user_id: string; tickets_count: number | null; users?: { username?: string | null; email?: string | null } | null }[]
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
          .select("user_id,tickets_count,users:users(username,email)")
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
  const buyInLabel = `${price.toLocaleString("fa-IR")}`;
  const playersLabel =
    tournament?.table_size_fixed ??
    tournament?.table_size_max ??
    tournament?.table_size_min ??
    null;

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
    const amountHold = qty * price;
    const amountTotal = newTickets * price;
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
        p_amount: amountHold,
        p_currency: currency,
        p_entry_id: null,
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
          p_amount: amountHold,
          p_currency: currency,
          p_entry_id: null,
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
      .select("user_id,tickets_count,users:users(username,email)")
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
    const amount = Math.max(1, userEntry.tickets_count ?? 1) * price;
    setSubmitting(true);
    try {
      const { error: relErr } = await supabase.rpc("fn_tournament_wallet_release", {
        p_tournament_id: tournament.id,
        p_amount: amount,
        p_currency: currency,
        p_entry_id: null,
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

  const previewTables: ActiveTable[] = useMemo(() => {
    if (!tournament) return [];
    const prize = tournament.guaranteed_prize ?? 0;
    const cardCount = minQty > 0 ? minQty : 1;
    return [
      {
        id: `tournament-table-${tournament.id}`,
        prize,
        players: 0,
        cardCount,
      },
    ];
  }, [minQty, tournament]);

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
            <span className="text-gray-300">جایزه کل</span>
            <span className="text-amber-300 font-semibold">{prizeLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">ورودی (Buy-in)</span>
            <span className="text-gray-100 font-semibold">{buyInLabel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">بازیکن‌ها</span>
            <span className="text-emerald-300 font-semibold">
              {playersLabel != null ? playersLabel : "-"}
            </span>
          </div>
        </div>

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

        <TournamentActiveCardsStatus
          cards={previewCards}
          secondsRemaining={startCountdown}
          useLongCountdown
        />

        <ActiveTablesSection tables={previewTables} onTableClick={() => {}} />

      </div>
    </div>
  );
}
