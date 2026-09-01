"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DevLeoBandCapsPanel from "@/components/dev-panel/DevLeoBandCapsPanel";
import DevLeoLiveStatsPanel from "@/components/dev-panel/DevLeoLiveStatsPanel";
import DevLeoPresetLibraryPanel from "@/components/dev-panel/DevLeoPresetLibraryPanel";
import DevLeoUserList from "@/components/dev-panel/DevLeoUserList";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadDevPlayerProfileOperators } from "@/services/dev-panel/dev-player-profiles";
import {
  loadLeoOverview,
  loadLeoTemplates,
  loadLeoUserDetail,
  loadLeoUsers,
  patchLeoSettings,
  saveLeoUserConfig,
} from "@/services/dev-panel/leo-client";
import type { DevPlayerProfileOperator } from "@/src/types/dev-player-profiles";
import type { LeoBandCap, LeoLiveStats, LeoTemplateOption, LeoUserDetail, LeoUserListRow } from "@/src/types/leo";

const DEFAULT_LEO_OPERATOR_USERNAME = "mexic";

export default function DevLeoManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [initialLoading, setInitialLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const isFirstLoad = useRef(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [operatorReady, setOperatorReady] = useState(false);
  const [operators, setOperators] = useState<DevPlayerProfileOperator[]>([]);
  const [users, setUsers] = useState<LeoUserListRow[]>([]);
  const [templates, setTemplates] = useState<LeoTemplateOption[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<LeoUserDetail | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [systemEnabled, setSystemEnabled] = useState(false);
  const [enabledCount, setEnabledCount] = useState(0);
  const [bandCaps, setBandCaps] = useState<LeoBandCap[]>([]);
  const [maxLeoPlayersPerWaitingRoom, setMaxLeoPlayersPerWaitingRoom] = useState(3);
  const [maxLeoCardsPerJoin, setMaxLeoCardsPerJoin] = useState(0);
  const [liveStats, setLiveStats] = useState<LeoLiveStats>({
    activeLeoPlayers: 0,
    leoRoomCount: 0,
    nonLeoPlayersInLeoRooms: 0,
  });
  const [pendingEventCount, setPendingEventCount] = useState(0);
  const [presetsRevision, setPresetsRevision] = useState(0);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.push("/dev-panel/dashboard"));
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [router, setShowHeader, setShowBackButton, setOnBackClick]);

  const refreshList = useCallback(async () => {
    const [overview, userRows, templateRows] = await Promise.all([
      loadLeoOverview(),
      loadLeoUsers({
        search: search.trim() || undefined,
        operatorId: operatorId || undefined,
        limit: 200,
      }),
      loadLeoTemplates(),
    ]);
    setSystemEnabled(overview.settings.systemEnabled);
    setEnabledCount(overview.enabledUserCount);
    setBandCaps(overview.bandCaps ?? []);
    setMaxLeoPlayersPerWaitingRoom(overview.settings.maxLeoPlayersPerWaitingRoom ?? 3);
    setMaxLeoCardsPerJoin(overview.settings.maxLeoCardsPerJoin ?? 0);
    setLiveStats(overview.liveStats);
    setPendingEventCount(overview.pendingEventCount);
    setUsers(userRows);
    setTemplates(templateRows);
  }, [search, operatorId]);

  useEffect(() => {
    let cancelled = false;

    loadDevPlayerProfileOperators()
      .then((rows) => {
        if (cancelled) return;
        setOperators(rows);
        const defaultOperator = rows.find(
          (operator) => operator.username.trim().toLowerCase() === DEFAULT_LEO_OPERATOR_USERNAME
        );
        if (defaultOperator) {
          setOperatorId(defaultOperator.id);
          console.log("[Leo] default operator", {
            operatorId: defaultOperator.id,
            username: defaultOperator.username,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error("[Leo] load operators error:", error);
        }
      })
      .finally(() => {
        if (!cancelled) setOperatorReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!operatorReady) return;

    let cancelled = false;

    if (isFirstLoad.current) {
      setInitialLoading(true);
    } else {
      setListLoading(true);
    }

    refreshList()
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "خطا در بارگذاری");
        }
      })
      .finally(() => {
        if (!cancelled) {
          if (isFirstLoad.current) {
            isFirstLoad.current = false;
            setInitialLoading(false);
          }
          setListLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [operatorReady, refreshList]);

  useEffect(() => {
    if (!systemEnabled) return;

    const intervalId = window.setInterval(() => {
      void loadLeoOverview()
        .then((overview) => {
          setLiveStats(overview.liveStats);
          setPendingEventCount(overview.pendingEventCount);
          setEnabledCount(overview.enabledUserCount);
        })
        .catch((error) => {
          console.error("[Leo] live stats poll error:", error);
        });
    }, 30_000);

    return () => window.clearInterval(intervalId);
  }, [systemEnabled]);

  const toggleUser = async (userId: string) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      setExpandedUser(null);
      return;
    }

    setExpandedUserId(userId);
    setExpandedUser(null);
    setLoadingUserId(userId);

    try {
      const detail = await loadLeoUserDetail(userId);
      setExpandedUser(detail);
    } catch (error) {
      setExpandedUserId(null);
      toast.error(error instanceof Error ? error.message : "خطا در بارگذاری کاربر");
    } finally {
      setLoadingUserId(null);
    }
  };

  const toggleLeoEnabled = async (user: LeoUserListRow) => {
    if (submitting) return;
    if (user.devPlayerActive && !user.leoEnabled) {
      toast.error(
        "این کاربر در Dev Player فعال است. برای فعال‌سازی لئو ابتدا Dev Player را غیرفعال کنید."
      );
      return;
    }

    const nextEnabled = !user.leoEnabled;
    setSubmitting(true);
    console.log(`[Leo] toggle enabled user=${user.userId} next=${nextEnabled}`);

    try {
      const detail =
        expandedUser?.userId === user.userId
          ? expandedUser
          : await loadLeoUserDetail(user.userId);
      if (!detail) {
        throw new Error("user not found");
      }

      const saved = await saveLeoUserConfig(user.userId, {
        isEnabled: nextEnabled,
        activeTimeBands: detail.activeTimeBands,
        behaviorProfile: detail.behaviorProfile,
        sessionBudget: detail.sessionBudget,
        hardStopLoss: detail.hardStopLoss,
        maxConcurrentTables: detail.maxConcurrentTables,
        preferredTemplateIds: detail.preferredTemplateIds,
        randomTemplateIds: detail.randomTemplateIds,
        appliedPresetName: detail.appliedPresetName,
      });

      setUsers((current) =>
        current.map((row) =>
        row.userId === user.userId
          ? { ...row, leoEnabled: saved.isEnabled, appliedPresetName: saved.appliedPresetName }
          : row
        )
      );
      if (expandedUser?.userId === user.userId) {
        setExpandedUser(saved);
      }
      toast.success(saved.isEnabled ? "لئو فعال شد" : "لئو غیرفعال شد");
      void refreshList();
    } catch (error) {
      console.error("[Leo] toggle enabled error:", error);
      toast.error(error instanceof Error ? error.message : "خطا در تغییر وضعیت لئو");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSystem = async () => {
    setSubmitting(true);
    try {
      const next = !systemEnabled;
      await patchLeoSettings({ systemEnabled: next, schedulerEnabled: next });
      setSystemEnabled(next);
      if (next) {
        void refreshList();
      }
      toast.success(next ? "سیستم لئو روشن شد" : "سیستم لئو خاموش شد");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خطا");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOperatorChange = (nextOperatorId: string) => {
    setOperatorId(nextOperatorId);
    setExpandedUserId(null);
    setExpandedUser(null);
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] p-4 text-center text-sm text-gray-400">
        در حال بارگذاری...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0E0F] p-4 pb-24">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-800 bg-[#151515] p-3">
          <div>
            <div className="text-sm font-medium text-white">سیستم لئو</div>
            <div className="text-xs text-gray-500">
              <span className="numeric-text numeric-text--12 text-violet-300" dir="ltr">
                {enabledCount.toLocaleString("en-US")}
              </span>{" "}
              کاربر فعال
            </div>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void toggleSystem()}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ${
              systemEnabled ? "bg-emerald-800 text-white" : "bg-gray-800 text-gray-300"
            }`}
          >
            {systemEnabled ? "روشن" : "خاموش"}
          </button>
        </div>

        {systemEnabled ? (
          <DevLeoLiveStatsPanel stats={liveStats} pendingEventCount={pendingEventCount} />
        ) : null}

        <DevLeoBandCapsPanel
          caps={bandCaps}
          maxLeoPlayersPerWaitingRoom={maxLeoPlayersPerWaitingRoom}
          maxLeoCardsPerJoin={maxLeoCardsPerJoin}
          submitting={submitting}
          onSubmittingChange={setSubmitting}
          onSaved={(saved) => {
            setMaxLeoPlayersPerWaitingRoom(saved.maxLeoPlayersPerWaitingRoom);
            setMaxLeoCardsPerJoin(saved.maxLeoCardsPerJoin);
            setBandCaps((current) =>
              saved.bandCaps.map((cap) => {
                const previous = current.find((item) => item.timeBand === cap.timeBand);
                const stakes = (cap.stakes ?? []).map((stake) => {
                  const previousStake = previous?.stakes.find(
                    (item) => item.stakeTier === stake.stakeTier
                  );
                  return {
                    ...stake,
                    readyCount: previousStake?.readyCount ?? stake.readyCount ?? 0,
                    busyCount: previousStake?.busyCount ?? stake.busyCount ?? 0,
                  };
                });
                return {
                  ...cap,
                  stakes,
                  readyCount: stakes.reduce((sum, stake) => sum + stake.readyCount, 0),
                  busyCount: stakes.reduce((sum, stake) => sum + stake.busyCount, 0),
                };
              })
            );
          }}
        />

        <DevLeoPresetLibraryPanel
          users={users}
          submitting={submitting}
          onSubmittingChange={setSubmitting}
          onChanged={() => {
            setPresetsRevision((current) => current + 1);
            void refreshList();
          }}
        />

        <DevLeoUserList
          users={users}
          listLoading={listLoading}
          search={search}
          onSearchChange={setSearch}
          operators={operators}
          operatorId={operatorId}
          onOperatorChange={handleOperatorChange}
          expandedUserId={expandedUserId}
          expandedUser={expandedUser}
          loadingUserId={loadingUserId}
          templates={templates}
          submitting={submitting}
          onSubmittingChange={setSubmitting}
          onToggleUser={(userId) => void toggleUser(userId)}
          onToggleEnabled={(user) => void toggleLeoEnabled(user)}
          presetsRevision={presetsRevision}
          onSaved={(saved) => {
            setExpandedUser(saved);
            setUsers((current) =>
              current.map((row) =>
                row.userId === saved.userId
                  ? {
                      ...row,
                      leoEnabled: saved.isEnabled,
                      behaviorProfile: saved.behaviorProfile,
                      appliedPresetName: saved.appliedPresetName,
                    }
                  : row
              )
            );
            void refreshList();
          }}
        />
      </div>
    </div>
  );
}
