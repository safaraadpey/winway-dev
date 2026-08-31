"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DevLeoUserList from "@/components/dev-panel/DevLeoUserList";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadDevPlayerProfileOperators } from "@/services/dev-panel/dev-player-profiles";
import {
  loadLeoOverview,
  loadLeoTemplates,
  loadLeoUserDetail,
  loadLeoUsers,
  patchLeoSettings,
} from "@/services/dev-panel/leo-client";
import type { DevPlayerProfileOperator } from "@/src/types/dev-player-profiles";
import type { LeoTemplateOption, LeoUserDetail, LeoUserListRow } from "@/src/types/leo";

export default function DevLeoManager() {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();

  const [initialLoading, setInitialLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const isFirstLoad = useRef(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [operators, setOperators] = useState<DevPlayerProfileOperator[]>([]);
  const [users, setUsers] = useState<LeoUserListRow[]>([]);
  const [templates, setTemplates] = useState<LeoTemplateOption[]>([]);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedUser, setExpandedUser] = useState<LeoUserDetail | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [systemEnabled, setSystemEnabled] = useState(false);
  const [enabledCount, setEnabledCount] = useState(0);

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
    setUsers(userRows);
    setTemplates(templateRows);
  }, [search, operatorId]);

  useEffect(() => {
    loadDevPlayerProfileOperators()
      .then(setOperators)
      .catch((error) => {
        console.error("[Leo] load operators error:", error);
      });
  }, []);

  useEffect(() => {
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
  }, [refreshList]);

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

  const toggleSystem = async () => {
    setSubmitting(true);
    try {
      const next = !systemEnabled;
      await patchLeoSettings({ systemEnabled: next, schedulerEnabled: next });
      setSystemEnabled(next);
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
          onSaved={(saved) => {
            setExpandedUser(saved);
            void refreshList();
          }}
        />
      </div>
    </div>
  );
}
