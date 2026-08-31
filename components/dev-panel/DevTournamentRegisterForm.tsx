"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  formatScheduleWindowDuration,
  resolveScheduleWindow,
} from "@/lib/dev-panel/tournamentRegistrationSchedule";
import {
  formatTournamentOptionLabel,
  formatTournamentStartAt,
  toLocalDateTimeInputValue,
} from "@/components/dev-panel/dev-tournament-register-utils";
import { loadDevPlayerProfileOperators, loadDevPlayerProfilePlayers } from "@/services/dev-panel/dev-player-profiles";
import {
  previewTournamentRegistration,
  registerTournamentPlayersImmediate,
  scheduleTournamentRegistration,
} from "@/services/dev-panel/tournament-register-client";
import type { DevPlayerProfileOperator, DevPlayerProfilePlayerOption } from "@/src/types/dev-player-profiles";
import type {
  DevTournamentRegisterPreviewResult,
  DevTournamentRegisterTournament,
} from "@/src/types/dev-tournament-register";
import { formatScheduleTime } from "@/components/dev-panel/dev-tournament-register-utils";

type Props = {
  tournaments: DevTournamentRegisterTournament[];
  submitting: boolean;
  onSubmittingChange: (value: boolean) => void;
  onSuccess: () => void;
  onCancel: () => void;
};

export default function DevTournamentRegisterForm({
  tournaments,
  submitting,
  onSubmittingChange,
  onSuccess,
  onCancel,
}: Props) {
  const [operators, setOperators] = useState<DevPlayerProfileOperator[]>([]);
  const [players, setPlayers] = useState<DevPlayerProfilePlayerOption[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  const [tournamentId, setTournamentId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [registrationOpenTime, setRegistrationOpenTime] = useState(toLocalDateTimeInputValue(new Date()));
  const [preview, setPreview] = useState<DevTournamentRegisterPreviewResult | null>(null);

  const selectedTournament = useMemo(
    () => tournaments.find((row) => row.id === tournamentId) ?? null,
    [tournaments, tournamentId]
  );

  const scheduleWindowLabel = useMemo(() => {
    if (!registrationOpenTime) return null;
    const openTime = new Date(registrationOpenTime);
    if (Number.isNaN(openTime.getTime())) return null;

    const window = resolveScheduleWindow(
      openTime,
      selectedTournament?.startAt ? new Date(selectedTournament.startAt) : null
    );
    return formatScheduleWindowDuration(window.windowMs);
  }, [registrationOpenTime, selectedTournament?.startAt]);

  useEffect(() => {
    loadDevPlayerProfileOperators()
      .then(setOperators)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "خطا در بارگذاری اپراتورها");
      });
  }, []);

  useEffect(() => {
    if (tournaments[0] && !tournamentId) {
      setTournamentId(tournaments[0].id);
    }
  }, [tournaments, tournamentId]);

  useEffect(() => {
    if (!operatorId) {
      setPlayers([]);
      setSelectedPlayerIds([]);
      return;
    }

    let cancelled = false;
    setLoadingPlayers(true);
    loadDevPlayerProfilePlayers({ operatorId })
      .then((rows) => {
        if (cancelled) return;
        setPlayers(rows);
        setSelectedPlayerIds(rows.map((row) => row.userId));
        setPreview(null);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "خطا در بارگذاری پلیرها");
          setPlayers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPlayers(false);
      });

    return () => {
      cancelled = true;
    };
  }, [operatorId]);

  const togglePlayer = (userId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
    setPreview(null);
  };

  const allPlayersSelected = players.length > 0 && selectedPlayerIds.length === players.length;
  const somePlayersSelected = selectedPlayerIds.length > 0 && selectedPlayerIds.length < players.length;

  const toggleAllPlayers = () => {
    setSelectedPlayerIds(allPlayersSelected ? [] : players.map((row) => row.userId));
    setPreview(null);
  };

  const registrationOpenIso = () => new Date(registrationOpenTime).toISOString();

  const handlePreview = async () => {
    if (!tournamentId || selectedPlayerIds.length === 0) {
      toast.error("تورنومنت و حداقل یک پلیر انتخاب کنید");
      return;
    }

    onSubmittingChange(true);
    try {
      const result = await previewTournamentRegistration({
        tournamentId,
        registrationOpenTime: registrationOpenIso(),
        playerIds: selectedPlayerIds,
      });
      setPreview(result);
      toast.success("پیش‌نمایش زمان‌بندی آماده شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در پیش‌نمایش");
    } finally {
      onSubmittingChange(false);
    }
  };

  const handleImmediate = async () => {
    if (!tournamentId || selectedPlayerIds.length === 0) {
      toast.error("تورنومنت و حداقل یک پلیر انتخاب کنید");
      return;
    }

    onSubmittingChange(true);
    try {
      const result = await registerTournamentPlayersImmediate({
        tournamentId,
        operatorId: operatorId || undefined,
        name: campaignName.trim() || undefined,
        registrationOpenTime: registrationOpenIso(),
        playerIds: selectedPlayerIds,
      });
      toast.success(
        `ثبت فوری: ${result.summary.registered} موفق، ${result.summary.skipped} رد شده، ${result.summary.failed} خطا`
      );
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در ثبت فوری");
    } finally {
      onSubmittingChange(false);
    }
  };

  const handleSchedule = async () => {
    if (!tournamentId || !preview?.items.length) {
      toast.error("ابتدا پیش‌نمایش زمان‌بندی را بسازید");
      return;
    }

    onSubmittingChange(true);
    try {
      const result = await scheduleTournamentRegistration({
        tournamentId,
        operatorId: operatorId || undefined,
        name: campaignName.trim() || undefined,
        registrationOpenTime: registrationOpenIso(),
        items: preview.items.map((item) => ({
          userId: item.userId,
          scheduledAt: item.scheduledAt,
        })),
      });
      toast.success(`کمپین زمان‌بندی با ${result.summary.scheduled ?? preview.items.length} پلیر ساخته شد`);
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در شروع زمان‌بندی");
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">ثبت‌نام جدید</h1>
          <p className="mt-1 text-xs text-gray-400">
            یک کمپین جدید برای تورنومنت و اپراتور انتخاب‌شده بسازید
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
        >
          بازگشت به لیست
        </button>
      </div>

      <div className="space-y-3 rounded-2xl border border-violet-900/60 bg-[#151515] p-4">
        <label className="block space-y-1">
          <span className="text-xs text-gray-400">نام کمپین (اختیاری)</span>
          <input
            type="text"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="مثلاً تست ۱۴ — dev_super"
            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-gray-400">تورنومنت (ثبت‌نام باز)</span>
          <select
            value={tournamentId}
            onChange={(e) => {
              setTournamentId(e.target.value);
              setPreview(null);
            }}
            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
          >
            {tournaments.length === 0 ? (
              <option value="">تورنومنت باز یافت نشد</option>
            ) : (
              tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {formatTournamentOptionLabel(tournament)}
                </option>
              ))
            )}
          </select>
        </label>

        {selectedTournament ? (
          <div className="rounded-lg border border-gray-800 bg-[#1f2933] p-3 text-xs text-gray-300">
            <div>
              زمان شروع:{" "}
              <span className="numeric-text numeric-text--12 text-white" dir="ltr">
                {formatTournamentStartAt(selectedTournament.startAt)}
              </span>
            </div>
            <div className="mt-1">
              قیمت بلیت:{" "}
              <span className="numeric-text numeric-text--12 text-white" dir="ltr">
                {selectedTournament.ticketPrice.toLocaleString("en-US")}
              </span>
            </div>
            <div className="mt-1">
              بلیت مجاز:{" "}
              <span className="numeric-text numeric-text--12 text-white" dir="ltr">
                {selectedTournament.minTicketsPerPlayer}-{selectedTournament.maxTicketsPerPlayer}
              </span>
            </div>
            {scheduleWindowLabel ? (
              <div className="mt-1">
                سیکل ثبت‌نام: <span className="text-white">{scheduleWindowLabel}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="block space-y-1">
          <span className="text-xs text-gray-400">زمان باز شدن ثبت‌نام</span>
          <input
            type="datetime-local"
            value={registrationOpenTime}
            onChange={(e) => {
              setRegistrationOpenTime(e.target.value);
              setPreview(null);
            }}
            className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-white"
            dir="ltr"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-gray-400">اپراتور (سوپر / ایجنت)</span>
          <select
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-[#1f2933] px-3 py-2 text-sm text-white"
          >
            <option value="">انتخاب اپراتور...</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.displayName}
              </option>
            ))}
          </select>
        </label>

        {operatorId ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allPlayersSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = somePlayersSelected;
                  }}
                  onChange={toggleAllPlayers}
                  className="h-5 w-5 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                />
                <span className="text-xs text-gray-400">انتخاب همه</span>
              </label>
              <span className="numeric-text numeric-text--12 text-violet-300" dir="ltr">
                {selectedPlayerIds.length.toLocaleString("en-US")} / {players.length.toLocaleString("en-US")}
              </span>
            </div>
            {loadingPlayers ? (
              <div className="py-4 text-center text-xs text-gray-500">در حال بارگذاری...</div>
            ) : players.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-700 p-3 text-xs text-gray-500">
                پلیر فعالی برای این اپراتور یافت نشد.
              </div>
            ) : (
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {players.map((player) => {
                  const checked = selectedPlayerIds.includes(player.userId);
                  return (
                    <label
                      key={player.userId}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 ${
                        checked ? "border-violet-600 bg-violet-950/30" : "border-gray-700 bg-[#1f2933]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePlayer(player.userId)}
                        className="h-5 w-5 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                      />
                      <span className="min-w-0 text-sm text-white">
                        {player.displayName}
                        <span className="block truncate text-xs text-gray-400">{player.username}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handlePreview()}
            className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-60"
          >
            پیش‌نمایش زمان‌بندی
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleImmediate()}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
          >
            ثبت فوری
          </button>
          <button
            type="button"
            disabled={submitting || !preview?.items.length}
            onClick={() => void handleSchedule()}
            className="rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
          >
            شروع زمان‌بندی تا شروع تورنومنت
          </button>
        </div>
      </div>

      {preview?.items.length ? (
        <div className="rounded-2xl border border-gray-800 bg-[#151515] p-4">
          <h2 className="mb-3 text-sm font-semibold text-white">پیش‌نمایش زمان ثبت‌نام</h2>
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {preview.items.map((item) => (
              <div
                key={`${item.userId}-${item.scheduledAt}`}
                className="flex items-center justify-between rounded-lg border border-gray-800 bg-[#1f2933] px-3 py-2 text-xs"
              >
                <span className="text-white">{item.username}</span>
                <span className="numeric-text numeric-text--12 text-violet-200" dir="ltr">
                  {formatScheduleTime(item.scheduledAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
