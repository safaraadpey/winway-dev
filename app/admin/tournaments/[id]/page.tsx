"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { isTestTournamentMeta } from "@/lib/admin/testTournamentAccess";
import { useIsAdminZero } from "@/lib/admin/useIsAdminZero";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";

type TournamentRow = {
  id: string;
  title: string | null;
  status: string | null;
  start_at: string | null;
  currency: string | null;
  ticket_price: number | null;
  guaranteed_prize: number | null;
  meta?: Record<string, unknown> | null;
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

type PrizeTxRow = {
  user_id: string | null;
  users?: {
    username?: string | null;
    email?: string | null;
  } | null;
};

export default function AdminTournamentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [rooms, setRooms] = useState<RoundRoomRow[]>([]);
  const [winnerNames, setWinnerNames] = useState<string[]>([]);
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
        { data: pData, error: pErr },
      ] =
        await Promise.all([
          supabase
            .from("tournaments")
            .select("id,title,status,start_at,currency,ticket_price,guaranteed_prize,meta")
            .eq("id", tournamentId)
            .maybeSingle(),
          supabase
            .from("tournament_entries")
            .select("id,user_id,tickets_count,amount,status,created_at,users:users(username,email)")
            .eq("tournament_id", tournamentId)
            .eq("status", "created")
            .order("created_at", { ascending: false }),
          supabase
            .from("tournament_round_rooms")
            .select("id,round_no,table_no,room_id,status,created_at")
            .eq("tournament_id", tournamentId)
            .order("round_no", { ascending: true })
            .order("table_no", { ascending: true }),
          supabase
            .from("transactions")
            .select("user_id,users:users(username,email)")
            .eq("source_kind", "tournament_prize")
            .eq("type", "win")
            .eq("source_ref", tournamentId),
        ]);

      if (!active) return;

      if (tErr || eErr || rErr || pErr) {
        setError(
          tErr?.message ||
            eErr?.message ||
            rErr?.message ||
            pErr?.message ||
            "خطا در بارگذاری داده"
        );
        setNicknameByUserId({});
      } else {
        setTournament((tData as TournamentRow) ?? null);
        const nextEntries = (eData as EntryRow[]) ?? [];
        setEntries(nextEntries);
        setRooms((rData as RoundRoomRow[]) ?? []);
        const names = new Set<string>();
        for (const row of (pData as PrizeTxRow[]) || []) {
          const name = row.users?.username || row.users?.email || row.user_id || null;
          if (name) names.add(String(name));
        }
        setWinnerNames(Array.from(names));

        const uniqueUserIds = Array.from(
          new Set(nextEntries.map((e) => String(e.user_id || "").trim()).filter((id) => id.length > 0))
        );
        const nicknameMap: Record<string, string> = {};
        if (uniqueUserIds.length > 0) {
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (session?.access_token) {
            const response = await fetch("/api/admin/users/nicknames", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ user_ids: uniqueUserIds }),
            });
            const payload = await response.json().catch(() => null);
            if (response.ok && payload?.ok && Array.isArray(payload?.data)) {
              for (const row of payload.data as any[]) {
                const userId = String(row?.user_id || "").trim();
                const nickname = String(row?.nickname || "").trim();
                if (userId && nickname) {
                  nicknameMap[userId] = nickname;
                }
              }
            }
          }
        }
        setNicknameByUserId(nicknameMap);
      }
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [tournamentId]);

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
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">جزئیات تورنومنت</h1>
            {tournament && (
              <p className="text-gray-300 text-sm mt-1">
                {tournament.title || "بدون عنوان"} • وضعیت: {statusLabel(tournament.status || null)}
              </p>
            )}
          </div>
          <button
            onClick={() => router.push(`/admin/tournaments/${tournamentId}/edit`)}
            className="px-3 py-2 rounded-lg bg-[#27323f] text-sm text-white hover:bg-[#324052]"
          >
            ویرایش
          </button>
        </div>

        {loading && <div className="text-gray-300 text-sm">در حال بارگذاری...</div>}
        {error && <div className="text-red-400 text-sm">{error}</div>}

        {!loading && !error && tournament && (
          <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-gray-400">قیمت بلیت</div>
                <div className="font-semibold">
                  {tournament.ticket_price != null ? tournament.ticket_price.toLocaleString("en-US") : "-"}
                </div>
              </div>
              <div>
                <div className="text-gray-400">گارانتی</div>
                <div className="font-semibold">
                  {tournament.guaranteed_prize != null ? tournament.guaranteed_prize.toLocaleString("en-US") : "-"}
                </div>
              </div>
              <div>
                <div className="text-gray-400">ارز</div>
                <div className="font-semibold">{tournament.currency || "IRR"}</div>
              </div>
              <div>
                <div className="text-gray-400">زمان شروع</div>
                <div className="font-semibold">
                  {tournament.start_at ? new Date(tournament.start_at).toLocaleString("fa-IR") : "نامشخص"}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-gray-400">برنده‌ها</div>
                <div className="font-semibold break-words">
                  {winnerNames.length > 0 ? winnerNames.join("، ") : "نامشخص"}
                </div>
              </div>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">ثبت‌نامی‌ها</h2>
              <div className="text-xs text-gray-400">
                مجموع افراد: {entries.length} • مجموع بلیت‌ها:{" "}
                {entries.reduce((acc, e) => acc + (e.tickets_count || 0), 0)}
              </div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">کاربر</th>
                    <th className="py-2 pr-3">تعداد کارت</th>
                    <th className="py-2 pr-3">مبلغ</th>
                    <th className="py-2 pr-3">زمان</th>
                  </tr>
                </thead>
                <tbody className="text-gray-100">
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-gray-800">
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center gap-1 text-xs" dir="ltr">
                          <span>{e.users?.username || e.users?.email || e.user_id}</span>
                          {nicknameByUserId[e.user_id] ? (
                            <span className="text-gray-300">({nicknameByUserId[e.user_id]})</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{e.tickets_count ?? "-"}</td>
                      <td className="py-2 pr-3">
                        {e.amount != null ? e.amount.toLocaleString("en-US") : "-"}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {e.created_at ? new Date(e.created_at).toLocaleString("fa-IR") : "-"}
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-gray-400">
                        ثبت‌نامی وجود ندارد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">اتاق‌های راندها</h2>
              <div className="text-xs text-gray-400">تعداد: {rooms.length}</div>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full text-sm text-left">
                <thead className="text-gray-400">
                  <tr>
                    <th className="py-2 pr-3">راند</th>
                    <th className="py-2 pr-3">میز</th>
                    <th className="py-2 pr-3">Room ID</th>
                    <th className="py-2 pr-3">وضعیت</th>
                    <th className="py-2 pr-3">ایجاد</th>
                  </tr>
                </thead>
                <tbody className="text-gray-100">
                  {rooms.map((r) => (
                    <tr key={r.id} className="border-t border-gray-800">
                      <td className="py-2 pr-3">{r.round_no ?? "-"}</td>
                      <td className="py-2 pr-3">{r.table_no ?? "-"}</td>
                      <td className="py-2 pr-3">{r.room_id ?? "-"}</td>
                      <td className="py-2 pr-3">{statusLabel(r.status || null)}</td>
                      <td className="py-2 pr-3">
                        {r.created_at ? new Date(r.created_at).toLocaleString("fa-IR") : "-"}
                      </td>
                    </tr>
                  ))}
                  {rooms.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-3 text-center text-gray-400">
                        اتاقی ثبت نشده است.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

