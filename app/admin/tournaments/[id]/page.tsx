"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useParams } from "next/navigation";
import { isTestTournamentMeta } from "@/lib/admin/testTournamentAccess";
import { useIsAdminZero } from "@/lib/admin/useIsAdminZero";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { formatShamsiDateTime } from "@/lib/format/shamsiDate";
import { supabase } from "@/lib/supabaseClient";

type TournamentRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_at: string | null;
  currency: string | null;
  ticket_price: number | null;
  guaranteed_prize: number | null;
  commission_rate: number | null;
  meta?: {
    final_winners_count?: number | null;
    entry_currency?: string | null;
    is_test_tournament?: boolean | null;
  } | null;
};

type EntryRow = {
  id: string;
  user_id: string;
  tickets_count: number | null;
  amount: number | null;
  status: string | null;
  created_at: string | null;
  users?: {
    username?: string | null;
    email?: string | null;
  } | null;
};

type RoundRoomRow = {
  id: string;
  round_no: number | null;
  table_no: number | null;
  room_id: string | null;
  status: string | null;
  created_at: string | null;
};

type PrizeRuleRow = {
  rank: number;
  payout_type: string;
  payout_value: number | string | null;
};

type WinnerRow = {
  userId: string;
  name: string;
  rank: number | null;
  amount: number | null;
};

type DingRankRow = {
  rank: number;
  userId: string;
  name: string;
  dingTotal: number;
};

type PrizeItem = {
  rank: number;
  payoutType: string;
  payoutValue: number;
  amount: number | null;
  winnerName: string | null;
};

const RANK_LABELS = [
  "نفر اول",
  "نفر دوم",
  "نفر سوم",
  "نفر چهارم",
  "نفر پنجم",
  "نفر ششم",
  "نفر هفتم",
  "نفر هشتم",
];

function rankLabel(rank: number): string {
  return RANK_LABELS[rank - 1] ?? `نفر ${rank}`;
}

function normalizeCommissionRate(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return value / 100;
  return value;
}

function formatAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US");
}

function ExpandableCard({
  title,
  subtitle,
  trailing,
  children,
  defaultOpen = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasBody = children != null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-800 bg-[#1a1a1a]">
      <button
        type="button"
        onClick={() => {
          if (hasBody) setOpen((prev) => !prev);
        }}
        aria-expanded={hasBody ? open : undefined}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right"
      >
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white">{title}</div>
          {subtitle ? <div className="mt-0.5 text-xs text-gray-400">{subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          {hasBody ? (
            <span
              className={`text-xs text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            >
              ▼
            </span>
          ) : null}
        </div>
      </button>
      {open && hasBody ? (
        <div className="space-y-1.5 border-t border-gray-800 px-3 py-2 text-xs text-gray-300">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  count,
  children,
  emptyText,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  emptyText: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-gray-800 bg-[#151515]">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right"
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="flex items-center gap-2">
          <span className="numeric-text numeric-text--12 text-gray-400" dir="ltr">
            {count.toLocaleString("en-US")}
          </span>
          <span
            className={`text-xs text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▼
          </span>
        </div>
      </button>
      {open ? (
        <div className="space-y-2 border-t border-gray-800 px-4 py-3">
          {count === 0 ? (
            <div className="py-2 text-center text-sm text-gray-400">{emptyText}</div>
          ) : (
            children
          )}
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-gray-400">{label}</span>
      <span className="min-w-0 text-left text-gray-100">{value}</span>
    </div>
  );
}

export default function AdminTournamentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [rooms, setRooms] = useState<RoundRoomRow[]>([]);
  const [prizeRules, setPrizeRules] = useState<PrizeRuleRow[]>([]);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const [dingRanks, setDingRanks] = useState<DingRankRow[]>([]);
  const [nicknameByUserId, setNicknameByUserId] = useState<Record<string, string>>({});
  const { ready: adminZeroReady, isAdminZero } = useIsAdminZero();

  const tournamentId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
      ? params.id[0]
      : null;

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/admin/tournaments"));
  }, [router, setOnBackClick, setShowBackButton, setShowHeader]);

  useEffect(() => {
    if (!adminZeroReady || loading || !tournament) return;
    if (!isAdminZero && isTestTournamentMeta(tournament.meta)) {
      router.replace("/admin/tournaments");
    }
  }, [adminZeroReady, isAdminZero, loading, router, tournament]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!tournamentId) {
        setError("شناسه تورنومنت نامعتبر است");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);

      const [
        { data: tData, error: tErr },
        { data: eData, error: eErr },
        { data: rData, error: rErr },
        { data: prizeData, error: prizeErr },
      ] = await Promise.all([
        supabase
          .from("tournaments")
          .select(
            "id,title,status,start_at,currency,ticket_price,guaranteed_prize,commission_rate,meta"
          )
          .eq("id", tournamentId)
          .maybeSingle(),
        supabase
          .from("tournament_entries")
          .select("id,user_id,tickets_count,amount,status,created_at,users:users(username,email)")
          .eq("tournament_id", tournamentId)
          .in("status", ["created", "settled"])
          .order("created_at", { ascending: false }),
        supabase
          .from("tournament_round_rooms")
          .select("id,round_no,table_no,room_id,status,created_at")
          .eq("tournament_id", tournamentId)
          .order("round_no", { ascending: true })
          .order("table_no", { ascending: true }),
        supabase
          .from("tournament_prize_rules")
          .select("rank,payout_type,payout_value")
          .eq("tournament_id", tournamentId)
          .order("rank", { ascending: true }),
      ]);

      if (!active) return;

      if (tErr || eErr || rErr || prizeErr) {
        console.error("[Tournament] admin detail load error", tErr || eErr || rErr || prizeErr);
        setError(
          tErr?.message ||
            eErr?.message ||
            rErr?.message ||
            prizeErr?.message ||
            "خطا در بارگذاری داده"
        );
        setNicknameByUserId({});
        setWinners([]);
        setDingRanks([]);
        setPrizeRules([]);
        setLoading(false);
        return;
      }

      const nextTournament = (tData as TournamentRow) ?? null;
      const nextEntries = (eData as EntryRow[]) ?? [];
      const nextRooms = (rData as RoundRoomRow[]) ?? [];
      const nextPrizeRules = (prizeData as PrizeRuleRow[]) ?? [];
      setTournament(nextTournament);
      setEntries(nextEntries);
      setRooms(nextRooms);
      setPrizeRules(nextPrizeRules);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;

      const uniqueUserIds = Array.from(
        new Set(nextEntries.map((e) => String(e.user_id || "").trim()).filter((id) => id.length > 0))
      );

      const nicknameReq =
        token && uniqueUserIds.length > 0
          ? fetch("/api/admin/users/nicknames", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ user_ids: uniqueUserIds }),
            })
              .then((res) => res.json().catch(() => null))
              .then((payload) => {
                const nicknameMap: Record<string, string> = {};
                if (payload?.ok && Array.isArray(payload?.data)) {
                  for (const row of payload.data as { user_id?: string; nickname?: string }[]) {
                    const userId = String(row?.user_id || "").trim();
                    const nickname = String(row?.nickname || "").trim();
                    if (userId && nickname) nicknameMap[userId] = nickname;
                  }
                }
                return nicknameMap;
              })
              .catch((err) => {
                console.error("[Tournament] admin nicknames error", err);
                return {} as Record<string, string>;
              })
          : Promise.resolve({} as Record<string, string>);

      const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const search = new URLSearchParams({ tournamentId });

      const winnersReq = fetch(`/api/player/tournament-winners?${search.toString()}`, {
        method: "GET",
        headers: authHeaders,
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) return [] as WinnerRow[];
          const payload = (await res.json()) as {
            winners?: Array<{
              userId?: string;
              name?: string;
              rank?: number | null;
              amount?: number | null;
            }>;
          };
          return (payload.winners || []).map((row) => ({
            userId: String(row.userId || ""),
            name: String(row.name || "بازیکن"),
            rank: row.rank != null ? Number(row.rank) : null,
            amount: row.amount != null ? Number(row.amount) : null,
          }));
        })
        .catch((err) => {
          console.error("[Tournament] admin winners error", err);
          return [] as WinnerRow[];
        });

      const dingReq = fetch(`/api/player/tournament-ding-leaderboard?${search.toString()}`, {
        method: "GET",
        headers: authHeaders,
        cache: "no-store",
      })
        .then(async (res) => {
          if (!res.ok) return [] as DingRankRow[];
          const payload = (await res.json()) as {
            leaderboard?: Array<{
              rank?: number;
              userId?: string;
              name?: string;
              dingTotal?: number;
            }>;
          };
          return (payload.leaderboard || []).map((row) => ({
            rank: Number(row.rank || 0),
            userId: String(row.userId || ""),
            name: String(row.name || "بازیکن"),
            dingTotal: Number(row.dingTotal || 0),
          }));
        })
        .catch((err) => {
          console.error("[Tournament] admin ding leaderboard error", err);
          return [] as DingRankRow[];
        });

      const [nicknameMap, nextWinners, nextDingRanks] = await Promise.all([
        nicknameReq,
        winnersReq,
        dingReq,
      ]);

      if (!active) return;

      setNicknameByUserId(nicknameMap);
      setWinners(nextWinners);
      setDingRanks(nextDingRanks);
      console.info("[Tournament] admin detail loaded", {
        tournamentId,
        prizeRules: nextPrizeRules.length,
        winners: nextWinners.length,
        dingRanks: nextDingRanks.length,
        rooms: nextRooms.length,
      });
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [tournamentId]);

  const prizePool = useMemo(() => {
    if (!tournament) return 0;
    const entryCurrency = String(
      tournament.meta?.entry_currency || tournament.currency || "IRR"
    );
    const price = Number(tournament.ticket_price) || 0;
    const totalTickets = entries.reduce((acc, e) => acc + (e.tickets_count || 0), 0);
    const commissionRate = normalizeCommissionRate(tournament.commission_rate);
    const prizePoolGross = entryCurrency === "DING" ? 0 : price * totalTickets;
    const prizePoolNet = Math.max(0, prizePoolGross * (1 - commissionRate));
    const guaranteedPrize = Number(tournament.guaranteed_prize) || 0;
    return guaranteedPrize > 0 ? Math.max(guaranteedPrize, prizePoolNet) : prizePoolNet;
  }, [tournament, entries]);

  const prizeItems = useMemo<PrizeItem[]>(() => {
    const winnerByRank = new Map<number, WinnerRow>();
    for (const winner of winners) {
      if (winner.rank != null) winnerByRank.set(winner.rank, winner);
    }

    if (prizeRules.length > 0) {
      return [...prizeRules]
        .sort((a, b) => a.rank - b.rank)
        .map((rule) => {
          const payoutValue = Number(rule.payout_value) || 0;
          const winner = winnerByRank.get(rule.rank);
          let amount = winner?.amount ?? null;
          if (amount == null) {
            if (rule.payout_type === "percent") {
              const fraction = payoutValue > 1 ? payoutValue / 100 : payoutValue;
              amount = Math.round(prizePool * fraction);
            } else {
              amount = payoutValue;
            }
          }
          return {
            rank: rule.rank,
            payoutType: rule.payout_type,
            payoutValue,
            amount,
            winnerName: winner?.name ?? null,
          };
        });
    }

    if (winners.length > 0) {
      return winners.map((winner, index) => ({
        rank: winner.rank ?? index + 1,
        payoutType: "paid",
        payoutValue: winner.amount ?? 0,
        amount: winner.amount,
        winnerName: winner.name,
      }));
    }

    return [];
  }, [prizeRules, winners, prizePool]);

  const statusLabel = (v: string | null) => {
    switch (v) {
      case "draft":
        return "پیش‌نویس";
      case "registration_open":
        return "ثبت‌نام باز";
      case "running":
        return "در حال اجرا";
      case "settling":
        return "در حال تسویه";
      case "finished":
        return "پایان‌یافته";
      case "cancelled":
        return "لغوشده";
      default:
        return v || "-";
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 text-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">جزئیات تورنومنت</h1>
            {tournament && (
              <p className="mt-1 text-sm text-gray-300">
                {tournament.title || "بدون عنوان"} • وضعیت: {statusLabel(tournament.status || null)}
              </p>
            )}
          </div>
          <button
            onClick={() => router.push(`/admin/tournaments/${tournamentId}/edit`)}
            className="rounded-lg bg-[#27323f] px-3 py-2 text-sm text-white hover:bg-[#324052]"
          >
            ویرایش
          </button>
        </div>

        {loading && <div className="text-sm text-gray-300">در حال بارگذاری...</div>}
        {error && <div className="text-sm text-red-400">{error}</div>}

        {!loading && !error && tournament && (
          <div className="space-y-2 rounded-2xl border border-gray-800 bg-[#151515] p-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-gray-400">قیمت بلیت</div>
                <div className="numeric-text numeric-text--14 font-semibold" dir="ltr">
                  {formatAmount(tournament.ticket_price)}
                </div>
              </div>
              <div>
                <div className="text-gray-400">گارانتی</div>
                <div className="numeric-text numeric-text--14 font-semibold" dir="ltr">
                  {formatAmount(tournament.guaranteed_prize)}
                </div>
              </div>
              <div>
                <div className="text-gray-400">ارز</div>
                <div className="font-semibold">{tournament.currency || "IRR"}</div>
              </div>
              <div>
                <div className="text-gray-400">زمان شروع</div>
                <div className="font-semibold">
                  {tournament.start_at ? formatShamsiDateTime(tournament.start_at) : "نامشخص"}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <CollapsibleSection
            title="لیست شرکت‌کننده‌ها"
            count={entries.length}
            emptyText="شرکت‌کننده‌ای ثبت نشده است."
          >
            {entries.map((entry) => {
              const username = entry.users?.username || entry.users?.email || "بازیکن";
              const nickname = nicknameByUserId[entry.user_id];
              const displayName = nickname || username;
              return (
                <ExpandableCard
                  key={entry.id}
                  title={displayName}
                  subtitle={nickname && username !== nickname ? username : undefined}
                  trailing={
                    <span className="numeric-text numeric-text--13 text-gray-300" dir="ltr">
                      {(entry.tickets_count ?? 0).toLocaleString("en-US")}
                    </span>
                  }
                >
                  <DetailRow label="نام" value={displayName} />
                  {nickname ? <DetailRow label="نام کاربری" value={username} /> : null}
                  <DetailRow
                    label="تعداد کارت"
                    value={
                      <span className="numeric-text numeric-text--12" dir="ltr">
                        {(entry.tickets_count ?? 0).toLocaleString("en-US")}
                      </span>
                    }
                  />
                  <DetailRow
                    label="مبلغ"
                    value={
                      <span className="numeric-text numeric-text--12" dir="ltr">
                        {formatAmount(entry.amount)}
                      </span>
                    }
                  />
                  <DetailRow
                    label="وضعیت"
                    value={
                      entry.status === "settled"
                        ? "تسویه‌شده"
                        : entry.status === "created"
                        ? "ثبت‌شده"
                        : entry.status || "-"
                    }
                  />
                  <DetailRow
                    label="زمان ثبت"
                    value={entry.created_at ? formatShamsiDateTime(entry.created_at) : "-"}
                  />
                  <DetailRow
                    label="شناسه کاربر"
                    value={
                      <span className="break-all font-mono text-[11px]" dir="ltr">
                        {entry.user_id || "-"}
                      </span>
                    }
                  />
                </ExpandableCard>
              );
            })}
          </CollapsibleSection>
        )}

        {!loading && !error && (
          <CollapsibleSection
            title="لیست جوایز"
            count={prizeItems.length}
            emptyText="جایزه‌ای تعریف نشده است."
          >
            {prizeItems.map((prize) => (
              <ExpandableCard
                key={`prize-${prize.rank}`}
                title={rankLabel(prize.rank)}
                subtitle={prize.winnerName || undefined}
                trailing={
                  <span className="numeric-text numeric-text--13 text-amber-300" dir="ltr">
                    {formatAmount(prize.amount)}
                  </span>
                }
              >
                <DetailRow label="رتبه" value={rankLabel(prize.rank)} />
                <DetailRow
                  label={prize.payoutType === "percent" ? "درصد" : "نوع پرداخت"}
                  value={
                    prize.payoutType === "percent" ? (
                      <span className="numeric-text numeric-text--12" dir="ltr">
                        {prize.payoutValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}%
                      </span>
                    ) : prize.payoutType === "fixed" ? (
                      "مبلغ ثابت"
                    ) : (
                      "پرداخت شده"
                    )
                  }
                />
                <DetailRow
                  label="مبلغ جایزه"
                  value={
                    <span className="numeric-text numeric-text--12" dir="ltr">
                      {formatAmount(prize.amount)}
                    </span>
                  }
                />
                <DetailRow label="برنده" value={prize.winnerName || "نامشخص"} />
              </ExpandableCard>
            ))}
          </CollapsibleSection>
        )}

        {!loading && !error && (
          <CollapsibleSection
            title="برنده‌ها"
            count={winners.length}
            emptyText="برنده‌ای ثبت نشده است."
          >
            {winners.map((winner, index) => (
              <ExpandableCard
                key={`${winner.userId}-${index}`}
                title={winner.name}
                subtitle={rankLabel(winner.rank ?? index + 1)}
                trailing={
                  <span className="numeric-text numeric-text--13 text-teal-300" dir="ltr">
                    {formatAmount(winner.amount)}
                  </span>
                }
              >
                <DetailRow label="رتبه" value={rankLabel(winner.rank ?? index + 1)} />
                <DetailRow label="نام" value={winner.name} />
                <DetailRow
                  label="مبلغ"
                  value={
                    <span className="numeric-text numeric-text--12" dir="ltr">
                      {formatAmount(winner.amount)}
                    </span>
                  }
                />
                <DetailRow
                  label="شناسه کاربر"
                  value={
                    <span className="break-all font-mono text-[11px]" dir="ltr">
                      {winner.userId || "-"}
                    </span>
                  }
                />
              </ExpandableCard>
            ))}
          </CollapsibleSection>
        )}

        {!loading && !error && (
          <CollapsibleSection
            title="رتبه‌بندی دینگ"
            count={dingRanks.length}
            emptyText="رتبه‌بندی دینگ ثبت نشده است."
          >
            {dingRanks.map((entry, index) => (
              <ExpandableCard
                key={`${entry.userId}-${index}`}
                title={entry.name}
                subtitle={`رتبه ${entry.rank}`}
                trailing={
                  <span className="numeric-text numeric-text--13 text-violet-300" dir="ltr">
                    {entry.dingTotal.toLocaleString("en-US")}
                  </span>
                }
              >
                <DetailRow
                  label="رتبه"
                  value={
                    <span className="numeric-text numeric-text--12" dir="ltr">
                      {entry.rank.toLocaleString("en-US")}
                    </span>
                  }
                />
                <DetailRow label="نام" value={entry.name} />
                <DetailRow
                  label="مجموع دینگ"
                  value={
                    <span className="numeric-text numeric-text--12" dir="ltr">
                      {entry.dingTotal.toLocaleString("en-US")}
                    </span>
                  }
                />
                <DetailRow
                  label="شناسه کاربر"
                  value={
                    <span className="break-all font-mono text-[11px]" dir="ltr">
                      {entry.userId || "-"}
                    </span>
                  }
                />
              </ExpandableCard>
            ))}
          </CollapsibleSection>
        )}

        {!loading && !error && (
          <CollapsibleSection
            title="اتاق‌های راندها"
            count={rooms.length}
            emptyText="اتاقی ثبت نشده است."
          >
            {rooms.map((room) => (
              <ExpandableCard
                key={room.id}
                title={`راند ${room.round_no ?? "-"} • میز ${room.table_no ?? "-"}`}
                subtitle={statusLabel(room.status || null)}
              >
                <DetailRow
                  label="راند"
                  value={
                    <span className="numeric-text numeric-text--12" dir="ltr">
                      {room.round_no ?? "-"}
                    </span>
                  }
                />
                <DetailRow
                  label="میز"
                  value={
                    <span className="numeric-text numeric-text--12" dir="ltr">
                      {room.table_no ?? "-"}
                    </span>
                  }
                />
                <DetailRow
                  label="Room ID"
                  value={
                    <span className="break-all font-mono text-[11px]" dir="ltr">
                      {room.room_id ?? "-"}
                    </span>
                  }
                />
                <DetailRow label="وضعیت" value={statusLabel(room.status || null)} />
                <DetailRow
                  label="ایجاد"
                  value={room.created_at ? formatShamsiDateTime(room.created_at) : "-"}
                />
              </ExpandableCard>
            ))}
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
