"use client";

import { useMemo, useState } from "react";
import DevLeoUserEditor from "@/components/dev-panel/DevLeoUserEditor";
import { profileLabel } from "@/components/dev-panel/leo-utils";
import type { DevPlayerProfileOperator } from "@/src/types/dev-player-profiles";
import type { LeoTemplateOption, LeoUserDetail, LeoUserListRow } from "@/src/types/leo";

type Props = {
  users: LeoUserListRow[];
  listLoading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  operators: DevPlayerProfileOperator[];
  operatorId: string;
  onOperatorChange: (operatorId: string) => void;
  expandedUserId: string | null;
  expandedUser: LeoUserDetail | null;
  loadingUserId: string | null;
  templates: LeoTemplateOption[];
  submitting: boolean;
  onSubmittingChange: (value: boolean) => void;
  onToggleUser: (userId: string) => void;
  onToggleEnabled: (user: LeoUserListRow) => void;
  onSaved: (user: LeoUserDetail) => void;
  presetsRevision?: number;
};

function operatorRoleLabel(role: DevPlayerProfileOperator["role"]): string {
  return role === "super" ? "سوپر" : "ایجنت";
}

export default function DevLeoUserList({
  users,
  listLoading,
  search,
  onSearchChange,
  operators,
  operatorId,
  onOperatorChange,
  expandedUserId,
  expandedUser,
  loadingUserId,
  templates,
  submitting,
  onSubmittingChange,
  onToggleUser,
  onToggleEnabled,
  onSaved,
  presetsRevision = 0,
}: Props) {
  const [filterOpen, setFilterOpen] = useState(false);

  const selectedOperator = useMemo(
    () => operators.find((operator) => operator.id === operatorId) ?? null,
    [operators, operatorId]
  );

  const supers = useMemo(
    () => operators.filter((operator) => operator.role === "super"),
    [operators]
  );

  const agents = useMemo(
    () => operators.filter((operator) => operator.role === "agent"),
    [operators]
  );

  const handleOperatorSelect = (nextOperatorId: string) => {
    onOperatorChange(nextOperatorId);
    setFilterOpen(false);
  };

  const renderOperatorButton = (operator: DevPlayerProfileOperator) => {
    const isSelected = operatorId === operator.id;

    return (
      <button
        key={operator.id}
        type="button"
        onClick={() => handleOperatorSelect(operator.id)}
        className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-right text-sm transition-colors ${
          isSelected
            ? "bg-violet-950/40 text-violet-100"
            : "text-gray-200 hover:bg-[#252f3a]"
        }`}
      >
        <span className="min-w-0 truncate">{operator.displayName}</span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            operator.role === "super"
              ? "bg-indigo-900/50 text-indigo-200"
              : "bg-sky-900/50 text-sky-200"
          }`}
        >
          {operatorRoleLabel(operator.role)}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">مدیریت لئو</h1>
        <p className="mt-1 text-xs text-gray-400">
          روی هر پلیر بزنید — تنظیمات همان‌جا باز می‌شود
        </p>
      </div>

      <input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="جستجو نام کاربری..."
        className="w-full rounded-xl border border-gray-700 bg-[#1f2933] px-4 py-3 text-sm text-white placeholder:text-gray-500"
      />

      <div className="overflow-hidden rounded-xl border border-gray-700 bg-[#1f2933]">
        <button
          type="button"
          onClick={() => setFilterOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm text-white"
        >
          <div className="min-w-0">
            <div className="font-medium">فیلتر سوپر / ایجنت</div>
            <div className="mt-0.5 truncate text-xs text-gray-400">
              {selectedOperator ? selectedOperator.displayName : "همه پلیرها"}
            </div>
          </div>
          <span
            className={`shrink-0 text-gray-500 transition-transform ${filterOpen ? "rotate-180" : ""}`}
            aria-hidden
          >
            ▾
          </span>
        </button>

        {filterOpen ? (
          <div className="max-h-64 overflow-y-auto border-t border-gray-700">
            <button
              type="button"
              onClick={() => handleOperatorSelect("")}
              className={`flex w-full items-center px-4 py-2.5 text-right text-sm transition-colors ${
                !operatorId
                  ? "bg-violet-950/40 font-medium text-violet-100"
                  : "text-gray-200 hover:bg-[#252f3a]"
              }`}
            >
              همه پلیرها
            </button>

            {supers.length > 0 ? (
              <div>
                <div className="border-t border-gray-800 px-4 py-2 text-[11px] font-semibold text-gray-500">
                  سوپرها
                </div>
                {supers.map(renderOperatorButton)}
              </div>
            ) : null}

            {agents.length > 0 ? (
              <div>
                <div className="border-t border-gray-800 px-4 py-2 text-[11px] font-semibold text-gray-500">
                  ایجنت‌ها
                </div>
                {agents.map(renderOperatorButton)}
              </div>
            ) : null}

            {operators.length === 0 ? (
              <div className="border-t border-gray-800 px-4 py-3 text-center text-xs text-gray-500">
                اپراتوری یافت نشد.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {listLoading ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-gray-800 bg-[#151515] py-12 text-center text-sm text-gray-500">
            در حال بارگذاری...
          </div>
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-700 p-8 text-center text-sm text-gray-500">
          {operatorId ? "پلیر زیر این اپراتور یافت نشد." : "کاربری یافت نشد."}
        </div>
      ) : (
        <div className="space-y-2">
          {users.map((user) => {
            const isExpanded = expandedUserId === user.userId;
            const isLoading = loadingUserId === user.userId;
            const enableBlocked = user.devPlayerActive && !user.leoEnabled;

            return (
              <div key={user.userId} className="overflow-hidden rounded-xl border border-gray-800">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onToggleUser(user.userId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onToggleUser(user.userId);
                    }
                  }}
                  className={`flex w-full cursor-pointer items-center justify-between gap-3 bg-[#151515] px-4 py-3 text-right transition-colors ${
                    isExpanded ? "border-b border-violet-800/60 bg-violet-950/20" : "hover:bg-[#1a1a1a]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-medium text-white">{user.displayName}</div>
                      {user.appliedPresetName ? (
                        <span
                          className="max-w-[160px] shrink-0 truncate rounded-full bg-indigo-900/50 px-2 py-0.5 text-[10px] font-semibold text-indigo-200"
                          title={user.appliedPresetName}
                        >
                          {user.appliedPresetName}
                        </span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-gray-500">{user.username}</div>
                    {user.behaviorProfile ? (
                      <div className="mt-1 truncate text-xs text-violet-300">
                        {profileLabel(user.behaviorProfile)}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        aria-pressed={user.leoEnabled}
                        disabled={submitting || enableBlocked}
                        title={
                          enableBlocked
                            ? "ابتدا Dev Player را غیرفعال کنید"
                            : user.leoEnabled
                              ? "غیرفعال کردن لئو"
                              : "فعال کردن لئو"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          onToggleEnabled(user);
                        }}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                          user.leoEnabled
                            ? "bg-emerald-900/40 text-emerald-200 hover:bg-emerald-800/70"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                        }`}
                      >
                        {user.leoEnabled ? "لئو فعال" : "غیرفعال"}
                      </button>
                      {user.devPlayerActive ? (
                        <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                          Dev Player
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      aria-hidden
                    >
                      ▾
                    </span>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-gray-800 bg-[#121212] p-3">
                    {isLoading || !expandedUser ? (
                      <div className="py-6 text-center text-xs text-gray-500">
                        در حال بارگذاری تنظیمات...
                      </div>
                    ) : (
                      <DevLeoUserEditor
                        key={expandedUser.userId}
                        inline
                        user={expandedUser}
                        templates={templates}
                        submitting={submitting}
                        presetsRevision={presetsRevision}
                        onSubmittingChange={onSubmittingChange}
                        onSaved={onSaved}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
