"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ALL_STAKE_TIERS,
  ALL_TIME_BANDS,
  bandLabel,
  stakeLabel,
} from "@/components/dev-panel/leo-utils";
import { saveLeoBandCaps } from "@/services/dev-panel/leo-client";
import type {
  LeoBandCap,
  LeoBandCapsSaveResult,
  LeoStakeTier,
  LeoTimeBand,
} from "@/src/types/leo";

type StakeDraft = { maxActivePlayers: string; shuffleEnabled: boolean };
type Draft = Record<LeoTimeBand, Record<LeoStakeTier, StakeDraft>>;

function emptyStakeDraft(): StakeDraft {
  return { maxActivePlayers: "0", shuffleEnabled: false };
}

const STAKE_FIELD_CLASS: Record<LeoStakeTier, string> = {
  light: "border-emerald-600/55 bg-emerald-900/50 text-emerald-100",
  medium: "border-amber-500/60 bg-amber-800/50 text-amber-100",
  heavy: "border-[#a04558]/75 bg-[#4c1824] text-[#f3c9d0]",
};

const SPINNERLESS_NUMBER =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function toDraft(caps: LeoBandCap[]): Draft {
  const draft = {} as Draft;
  for (const band of ALL_TIME_BANDS) {
    const cap = caps.find((item) => item.timeBand === band);
    const stakes = {} as Record<LeoStakeTier, StakeDraft>;
    for (const stakeTier of ALL_STAKE_TIERS) {
      const stake = cap?.stakes.find((item) => item.stakeTier === stakeTier);
      stakes[stakeTier] = {
        maxActivePlayers: String(stake?.maxActivePlayers ?? 0),
        shuffleEnabled: stake?.shuffleEnabled ?? false,
      };
    }
    draft[band] = stakes;
  }
  return draft;
}

export default function DevLeoBandCapsPanel({
  caps,
  maxLeoPlayersPerWaitingRoom,
  maxLeoCardsPerJoin,
  submitting,
  onSubmittingChange,
  onSaved,
}: {
  caps: LeoBandCap[];
  maxLeoPlayersPerWaitingRoom: number;
  maxLeoCardsPerJoin: number;
  submitting: boolean;
  onSubmittingChange: (value: boolean) => void;
  onSaved: (result: LeoBandCapsSaveResult) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(caps));
  const [perRoomCap, setPerRoomCap] = useState(String(maxLeoPlayersPerWaitingRoom));
  const [cardsCap, setCardsCap] = useState(String(maxLeoCardsPerJoin));
  const [bandsOpen, setBandsOpen] = useState(false);

  const totalReady = caps.reduce((sum, cap) => sum + (cap.readyCount ?? 0), 0);
  const totalBusy = caps.reduce((sum, cap) => sum + (cap.busyCount ?? 0), 0);

  useEffect(() => {
    setDraft(toDraft(caps));
  }, [caps]);

  useEffect(() => {
    setPerRoomCap(String(maxLeoPlayersPerWaitingRoom));
  }, [maxLeoPlayersPerWaitingRoom]);

  useEffect(() => {
    setCardsCap(String(maxLeoCardsPerJoin));
  }, [maxLeoCardsPerJoin]);

  const handleSave = async () => {
    const perRoomValue = Number(perRoomCap);
    if (!Number.isInteger(perRoomValue) || perRoomValue < 0 || perRoomValue > 50) {
      toast.error("سقف لئو در هر میز باید بین ۰ تا ۵۰ باشد");
      return;
    }

    const cardsCapValue = Number(cardsCap);
    if (!Number.isInteger(cardsCapValue) || cardsCapValue < 0 || cardsCapValue > 99) {
      toast.error("سقف خرید کارت باید بین ۰ تا ۹۹ باشد");
      return;
    }

    const payload: LeoBandCap[] = ALL_TIME_BANDS.map((timeBand) => {
      const stakes = ALL_STAKE_TIERS.map((stakeTier) => {
        const value = Number(draft[timeBand]?.[stakeTier]?.maxActivePlayers ?? 0);
        return {
          stakeTier,
          maxActivePlayers: Number.isInteger(value) ? value : -1,
          shuffleEnabled: draft[timeBand]?.[stakeTier]?.shuffleEnabled ?? false,
          readyCount: 0,
          busyCount: 0,
        };
      });
      return {
        timeBand,
        stakes,
        readyCount: 0,
        busyCount: 0,
      };
    });

    if (payload.some((band) => band.stakes.some((stake) => stake.maxActivePlayers < 0 || stake.maxActivePlayers > 500))) {
      toast.error("تعداد پلیر هر بازه قیمتی باید بین ۰ تا ۵۰۰ باشد");
      return;
    }

    onSubmittingChange(true);
    try {
      const saved = await saveLeoBandCaps(payload, perRoomValue, cardsCapValue);
      onSaved(saved);
      toast.success("سقف بازه‌ها ذخیره شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا در ذخیره سقف بازه‌ها");
    } finally {
      onSubmittingChange(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-gray-800 bg-[#151515] p-3">
      <div className="space-y-2 rounded-lg border border-gray-800 bg-[#1a1a1a] px-3 py-2">
        <div className="grid grid-cols-[1fr_72px] items-center gap-2">
          <span className="text-xs text-gray-200">حداکثر لئو در هر میز انتظار</span>
          <input
            type="number"
            min={0}
            max={50}
            value={perRoomCap}
            onChange={(event) => setPerRoomCap(event.target.value)}
            className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-1.5 text-white"
            dir="ltr"
            aria-label="حداکثر لئو در هر میز انتظار"
          />
        </div>
        <div className="grid grid-cols-[1fr_72px] items-center gap-2">
          <span className="text-xs text-gray-200">سقف خرید کارت</span>
          <input
            type="number"
            min={0}
            max={99}
            value={cardsCap}
            onChange={(event) => setCardsCap(event.target.value)}
            className="numeric-text numeric-text--14 w-full rounded-lg border border-gray-700 bg-[#1f2933] px-2 py-1.5 text-white"
            dir="ltr"
            aria-label="سقف خرید کارت"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-800 bg-[#1a1a1a]">
        <button
          type="button"
          onClick={() => setBandsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-right"
          aria-expanded={bandsOpen}
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-white">سقف پلیر در هر بازه</div>
            <p className="mt-0.5 text-[11px] text-gray-500">
              آماده{" "}
              <span className="numeric-text numeric-text--11 text-emerald-300" dir="ltr">
                {totalReady.toLocaleString("en-US")}
              </span>
              {" · "}
              مشغول{" "}
              <span className="numeric-text numeric-text--11 text-amber-300" dir="ltr">
                {totalBusy.toLocaleString("en-US")}
              </span>
            </p>
          </div>
          <span
            className={`shrink-0 text-gray-500 transition-transform ${bandsOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>

        {bandsOpen ? (
          <div className="space-y-2 border-t border-gray-800 px-3 py-2">
            {ALL_TIME_BANDS.map((band) => {
              const cap = caps.find((item) => item.timeBand === band);
              return (
                <div
                  key={band}
                  className="space-y-2 rounded-lg border border-gray-800 bg-[#1a1a1a] px-3 py-2"
                >
                  <div className="text-xs text-gray-200">{bandLabel(band)}</div>
                  <div className="grid grid-cols-3 gap-2">
                  {ALL_STAKE_TIERS.map((stakeTier) => {
                    const stake = cap?.stakes.find((item) => item.stakeTier === stakeTier);
                    const readyCount = stake?.readyCount ?? 0;
                    const busyCount = stake?.busyCount ?? 0;
                    const stakeDraft = draft[band]?.[stakeTier] ?? emptyStakeDraft();
                    return (
                      <div key={stakeTier} className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            max={500}
                            value={stakeDraft.maxActivePlayers}
                            onChange={(event) =>
                              setDraft((prev) => ({
                                ...prev,
                                [band]: {
                                  ...prev[band],
                                  [stakeTier]: {
                                    ...prev[band][stakeTier],
                                    maxActivePlayers: event.target.value,
                                  },
                                },
                              }))
                            }
                            className={`numeric-text numeric-text--14 min-w-0 w-full rounded-lg border px-2 py-1.5 ${SPINNERLESS_NUMBER} ${STAKE_FIELD_CLASS[stakeTier]}`}
                            dir="ltr"
                            aria-label={`سقف پلیر ${bandLabel(band)} ${stakeLabel(stakeTier)}`}
                          />
                          <label className="flex min-h-[36px] shrink-0 cursor-pointer items-center">
                            <input
                              type="checkbox"
                              checked={stakeDraft.shuffleEnabled}
                              onChange={(event) =>
                                setDraft((prev) => ({
                                  ...prev,
                                  [band]: {
                                    ...prev[band],
                                    [stakeTier]: {
                                      ...prev[band][stakeTier],
                                      shuffleEnabled: event.target.checked,
                                    },
                                  },
                                }))
                              }
                              className="h-4 w-4 rounded border-gray-600 bg-[#1f2933] text-violet-600"
                              aria-label={`شافل ${bandLabel(band)} ${stakeLabel(stakeTier)}`}
                            />
                          </label>
                        </div>
                        <div className="flex items-center justify-end gap-2 text-[11px] text-gray-500">
                          <span className="numeric-text numeric-text--11 text-emerald-300" dir="ltr">
                            {readyCount.toLocaleString("en-US")}
                          </span>
                          <span className="numeric-text numeric-text--11 text-amber-300" dir="ltr">
                            {busyCount.toLocaleString("en-US")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        disabled={submitting}
        onClick={() => void handleSave()}
        className="w-full rounded-xl border border-violet-700 bg-violet-950/40 py-2.5 text-sm font-semibold text-violet-100 disabled:opacity-50"
      >
        ذخیره سقف بازه‌ها
      </button>
    </div>
  );
}
