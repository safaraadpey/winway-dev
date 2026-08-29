"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { filterManagedUsers, getCachedManagedUsersBase, loadManagedUsers } from "@/services/users";
import {
  adjustWalletForUsersBulk,
  transferWalletForUsersBulk,
  loadTransactionHistory,
} from "@/services/transactions";
import {
  loadPendingWithdrawals,
  markWithdrawalProcessing,
  reviewWithdrawal,
} from "@/services/withdrawals";
import { supabase } from "@/lib/supabaseClient";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { formatCardDisplay, stripCardDigits } from "@/lib/format/cardNumber";
import { formatShebaDisplay, normalizeSheba } from "@/lib/format/shebaNumber";
import { formatShamsiDateTime } from "@/lib/format/shamsiDate";
import type {
  ManagedUserRoleFilter,
  ManagedUserSummary,
} from "@/src/types/users";
import type {
  TransactionAction,
  TransactionHistoryItem,
  DateFilter,
} from "@/src/types/transactions";
import type { WithdrawalRequestItem, WithdrawalKind } from "@/src/types/withdrawal";
import { getNetworkLabel, getWithdrawalStatusLabel } from "@/src/types/withdrawal";
import { canReviewRialWithdrawals } from "@/lib/withdrawal/constants";
import toast from "react-hot-toast";
import {
  getTransactionHistoryIndicator,
  TRANSACTION_HISTORY_LEGEND,
} from "@/lib/transactions/historyIndicator";

const ALL_ROLE_TABS: { key: ManagedUserRoleFilter; label: string }[] = [
  { key: "player", label: "پلیر" },
  { key: "agent", label: "ایجنت" },
  { key: "super", label: "سوپر" },
  { key: "all", label: "همه" },
];

type TabMode = "cashdesk" | "history" | "withdrawals";

const WITHDRAWAL_REVIEW_NOTE_PLACEHOLDER =
  "متنی که شما ایجنت محترم یادداشت میکنید در پنل کاربر قابل مشاهده است و رسید پرداخت یا دلیل رد خواهد بود ، لطفا در نوشتار دقت کنید";

function WithdrawalReviewNoteTextarea({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  const syncHeight = useCallback(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;

    mirror.textContent = value.trim() ? value : WITHDRAWAL_REVIEW_NOTE_PLACEHOLDER;
    textarea.style.height = `${mirror.scrollHeight + 4}px`;
  }, [value]);

  useLayoutEffect(() => {
    syncHeight();
  }, [syncHeight]);

  useEffect(() => {
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, [syncHeight]);

  return (
    <div className="relative w-full">
      <div
        ref={mirrorRef}
        aria-hidden
        dir="rtl"
        className="pointer-events-none invisible absolute inset-x-0 top-0 w-full whitespace-pre-wrap break-words px-3 py-2 text-sm text-right"
      />
      <textarea
        ref={textareaRef}
        dir="rtl"
        rows={1}
        className="w-full rounded-xl border border-gray-600 bg-[#111827] px-3 py-2 text-sm text-white text-right placeholder:text-right placeholder:text-gray-500 outline-none focus:border-teal-500 resize-none overflow-hidden"
        placeholder={WITHDRAWAL_REVIEW_NOTE_PLACEHOLDER}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onInput={syncHeight}
        disabled={disabled}
      />
    </div>
  );
}

interface TransactionsManagerProps {
  pageTitle?: string;
}

function getTotalsFromManagedUsers(users: ManagedUserSummary[]) {
  let playersTotal = 0;
  let agentsTotal = 0;
  let supersTotal = 0;

  for (const u of users) {
    const bal = Number(u.tomanBalance || 0);
    if (!Number.isFinite(bal)) continue;
    if (u.role === "player") playersTotal += bal;
    else if (u.role === "agent") agentsTotal += bal;
    else if (u.role === "super") supersTotal += bal;
  }

  return { playersTotal, agentsTotal, supersTotal };
}

export default function TransactionsManager({ pageTitle }: TransactionsManagerProps) {
  const searchParams = useSearchParams();
  const { refreshWalletBalances } = useBalancesContext();
  const [tab, setTab] = useState<TabMode>(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "withdrawals") return "withdrawals";
    if (tabParam === "history") return "history";
    return "cashdesk";
  });
  const [users, setUsers] = useState<ManagedUserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<ManagedUserRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amountInput, setAmountInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [totalPlayersBalance, setTotalPlayersBalance] = useState<number>(0);
  const [totalAgentsBalance, setTotalAgentsBalance] = useState<number>(0);
  const [totalSupersBalance, setTotalSupersBalance] = useState<number>(0);
  // History tab states
  const [historyTransactions, setHistoryTransactions] = useState<
    TransactionHistoryItem[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDateFilter, setHistoryDateFilter] = useState<DateFilter>("month");
  const [historySearch, setHistorySearch] = useState("");
  const [historySearchDebounced, setHistorySearchDebounced] = useState("");
  const [historyTypeFilters, setHistoryTypeFilters] = useState<Set<string>>(
    () => new Set()
  );
  const [currentUserRole, setCurrentUserRole] = useState<string>("player");
  const [withdrawalRequests, setWithdrawalRequests] = useState<
    WithdrawalRequestItem[]
  >([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(
    null
  );
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(
    null
  );
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [withdrawalKindFilter, setWithdrawalKindFilter] = useState<WithdrawalKind>(() => {
    const kindParam = searchParams.get("kind");
    return kindParam === "crypto" ? "crypto" : "rial";
  });

  const canAccessRialWithdrawals = canReviewRialWithdrawals(currentUserRole);
  const canAccessCryptoWithdrawals = currentUserRole === "admin";
  const canAccessWithdrawalsTab =
    canAccessRialWithdrawals || canAccessCryptoWithdrawals;
  const showWithdrawalKindTabs =
    canAccessRialWithdrawals && canAccessCryptoWithdrawals;

  const cachedUsersBase = getCachedManagedUsersBase();
  const [baseUsers, setBaseUsers] = useState<ManagedUserSummary[]>(
    () => cachedUsersBase?.usersAll ?? []
  );

  // فیلتر کردن تب‌ها بر اساس نقش کاربر فعلی
  const roleTabs = useMemo(() => {
    if (currentUserRole === "super") {
      // super: فقط همه، ایجنت، پلیر
      return ALL_ROLE_TABS.filter((tab) => tab.key !== "super");
    } else if (currentUserRole === "agent") {
      // agent: فقط همه، ایجنت و پلیر
      return ALL_ROLE_TABS.filter((tab) => tab.key !== "super");
    }
    // admin: همه تب‌ها
    return ALL_ROLE_TABS;
  }, [currentUserRole]);

  // اگر super/agent است و roleFilter روی "super" است، آن را به "all" تغییر بده
  useEffect(() => {
    if (currentUserRole === "super" && roleFilter === "super") {
      setRoleFilter("all");
    } else if (currentUserRole === "agent" && roleFilter === "super") {
      setRoleFilter("all");
    }
  }, [currentUserRole, roleFilter]);


  // موجودی‌های بالای صفحه را مستقیم از baseUsers محاسبه می‌کنیم
  // تا دقیقاً با لیست کاربران همگام باشد و تحت تاثیر query جداگانه قرار نگیرد.
  useEffect(() => {
    const { playersTotal, agentsTotal, supersTotal } = getTotalsFromManagedUsers(baseUsers);
    setTotalPlayersBalance(playersTotal);
    setTotalAgentsBalance(agentsTotal);
    setTotalSupersBalance(supersTotal);
  }, [baseUsers]);

  useEffect(() => {
    let isMounted = true;

    async function fetchBase() {
      try {
        setLoading(true);
        const result = await loadManagedUsers({ roleFilter: "all", search: "", maxAgeMs: 30_000 });
        if (!isMounted) return;
        setCurrentUserRole(result.currentUserRole);
        setBaseUsers(result.users);
      } catch (err) {
        console.error("Error loading managed users for transactions:", err);
        if (isMounted) toast.error("خطا در بارگذاری کاربران");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    // همیشه یک fetch تازه بزنیم تا cache قدیمی باعث نمایش صفر نشود.
    fetchBase();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usersFiltered = useMemo(() => {
    return filterManagedUsers(baseUsers, { roleFilter, search });
  }, [baseUsers, roleFilter, search]);

  useEffect(() => {
    setUsers(usersFiltered);
    // حذف انتخاب‌هایی که دیگر در لیست نیستند
    setSelectedIds((prev) => {
      const next = new Set<string>();
      usersFiltered.forEach((u) => {
        if (prev.has(u.id)) next.add(u.id);
      });
      return next;
    });
  }, [usersFiltered]);

  const totalUsers = users.length;
  const selectedCount = selectedIds.size;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleHistorySearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistorySearch(e.target.value);
  };

  const toggleHistoryTypeFilter = (legendKey: string) => {
    setHistoryTypeFilters((prev) => {
      const next = new Set(prev);
      if (next.has(legendKey)) next.delete(legendKey);
      else next.add(legendKey);
      return next;
    });
  };

  const displayedHistoryTransactions = useMemo(() => {
    if (historyTypeFilters.size === 0) return historyTransactions;
    return historyTransactions.filter((tx) =>
      historyTypeFilters.has(getTransactionHistoryIndicator(tx).legendKey)
    );
  }, [historyTransactions, historyTypeFilters]);

  // Debounce history search to avoid refetch per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setHistorySearchDebounced(historySearch);
    }, 400);
    return () => clearTimeout(t);
  }, [historySearch]);

  // بارگذاری تاریخچه تراکنش‌ها
  useEffect(() => {
    if (tab !== "history") return;

    let isMounted = true;

    async function fetchHistory() {
      try {
        setHistoryLoading(true);
        const result = await loadTransactionHistory({
          dateFilter: historyDateFilter,
          search: historySearchDebounced,
          maxAgeMs: 30_000,
        });
        if (!isMounted) return;
        setHistoryTransactions(result.transactions);
      } catch (err) {
        console.error("Error loading transaction history:", err);
        if (isMounted) {
          toast.error("خطا در بارگذاری تاریخچه تراکنش‌ها");
        }
      } finally {
        if (isMounted) setHistoryLoading(false);
      }
    }

    fetchHistory();

    return () => {
      isMounted = false;
    };
  }, [tab, historyDateFilter, historySearchDebounced]);

  useEffect(() => {
    if (loading) return;
    if (tab === "withdrawals" && !canAccessWithdrawalsTab) {
      setTab("cashdesk");
    }
  }, [tab, canAccessWithdrawalsTab, loading]);

  useEffect(() => {
    const kindParam = searchParams.get("kind");
    if (kindParam === "rial" || kindParam === "crypto") {
      setWithdrawalKindFilter(kindParam);
      return;
    }
    if (currentUserRole === "admin") {
      setWithdrawalKindFilter("crypto");
    } else if (currentUserRole === "agent" || currentUserRole === "super") {
      setWithdrawalKindFilter("rial");
    }
  }, [currentUserRole, searchParams]);

  useEffect(() => {
    if (tab !== "withdrawals") return;
    if (!canAccessWithdrawalsTab) return;
    if (withdrawalKindFilter === "crypto" && !canAccessCryptoWithdrawals) {
      setWithdrawalKindFilter("rial");
      return;
    }
    if (withdrawalKindFilter === "rial" && !canAccessRialWithdrawals) {
      setWithdrawalKindFilter("crypto");
      return;
    }

    let cancelled = false;

    async function fetchWithdrawals() {
      try {
        setWithdrawalsLoading(true);
        const rows = await loadPendingWithdrawals(withdrawalKindFilter);
        if (!cancelled) setWithdrawalRequests(rows);
      } catch (err) {
        console.error("[Withdrawal] admin list error:", err);
        if (!cancelled) toast.error("خطا در بارگذاری درخواست‌های برداشت");
      } finally {
        if (!cancelled) setWithdrawalsLoading(false);
      }
    }

    fetchWithdrawals();
    return () => {
      cancelled = true;
    };
  }, [
    tab,
    withdrawalKindFilter,
    canAccessWithdrawalsTab,
    canAccessCryptoWithdrawals,
    canAccessRialWithdrawals,
  ]);

  const handleWithdrawalReview = async (
    requestId: string,
    action: "approve" | "reject",
    kind: WithdrawalKind
  ) => {
    if (reviewingRequestId) return;
    const note = (reviewNotes[requestId] || "").trim();
    if (!note) {
      toast.error("لطفاً توضیحات بررسی را وارد کنید.");
      return;
    }
    setReviewingRequestId(requestId);
    try {
      const result = await reviewWithdrawal({
        requestId,
        action,
        kind,
        reason: note,
      });
      toast.success(result.message || "عملیات انجام شد.");
      const rows = await loadPendingWithdrawals(withdrawalKindFilter);
      setWithdrawalRequests(rows);
      await refreshWalletBalances?.();
    } catch (err: any) {
      console.error("[Withdrawal] review error:", err);
      toast.error(err?.message || "بررسی درخواست ناموفق بود.");
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handleMarkProcessing = async (
    requestId: string,
    kind: WithdrawalKind
  ) => {
    if (processingRequestId || reviewingRequestId) return;
    setProcessingRequestId(requestId);
    try {
      const result = await markWithdrawalProcessing({ requestId, kind });
      toast.success(result.message || "وضعیت به «در حال پرداخت» تغییر کرد.");
      const rows = await loadPendingWithdrawals(withdrawalKindFilter);
      setWithdrawalRequests(rows);
    } catch (err: any) {
      console.error("[Withdrawal] mark processing error:", err);
      toast.error(err?.message || "تغییر وضعیت ناموفق بود.");
    } finally {
      setProcessingRequestId(null);
    }
  };

  const copyWalletAddress = async (address: string) => {
    const trimmed = String(address || "").trim();
    if (!trimmed) return;
    try {
      await navigator.clipboard.writeText(trimmed);
      toast.success("آدرس کیف پول کپی شد.");
    } catch (err) {
      console.error("[Withdrawal] copy address failed", err);
      toast.error("کپی ناموفق بود.");
    }
  };

  const copyCardNumber = async (rawCard: string) => {
    const digits = stripCardDigits(rawCard);
    if (!digits) return;
    try {
      await navigator.clipboard.writeText(digits);
      toast.success("شماره کارت کپی شد.");
    } catch (err) {
      console.error("[Withdrawal] copy card failed", err);
      toast.error("کپی ناموفق بود.");
    }
  };

  const copyShebaNumber = async (rawSheba: string) => {
    const sheba = normalizeSheba(rawSheba);
    if (!sheba) return;
    try {
      await navigator.clipboard.writeText(sheba);
      toast.success("شماره شبا کپی شد.");
    } catch (err) {
      console.error("[Withdrawal] copy sheba failed", err);
      toast.error("کپی ناموفق بود.");
    }
  };

  const formatTransactionDate = (dateString: string): string =>
    formatShamsiDateTime(dateString);

  const toggleSelect = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCount === totalUsers && totalUsers > 0) {
      // اگر همه انتخاب شده‌اند، همه را deselect کن
      setSelectedIds(new Set());
    } else {
      // همه را انتخاب کن
      const allIds = new Set(users.map((u) => u.id));
      setSelectedIds(allIds);
    }
  };

  const allSelected = totalUsers > 0 && selectedCount === totalUsers;

  const renderUserLabel = (u: ManagedUserSummary) => {
    const username = String(u.username || "").trim();
    const nickname = String(u.nickname || "").trim();
    if (!username) return <span>کاربر</span>;
    return (
      <span className="inline-flex items-center gap-1" dir="ltr">
        <span>{username}</span>
        {nickname ? <span className="text-gray-300">({nickname})</span> : null}
      </span>
    );
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Keep internal state as digits only; render with thousands separators.
    const rawDigits = e.target.value.replace(/[^0-9]/g, "");
    setAmountInput(rawDigits);
  };

  const parsedAmount = amountInput ? parseInt(amountInput, 10) : 0;
  const formattedAmountValue = amountInput
    ? Number(amountInput).toLocaleString("en-US")
    : "";

  const handleAction = async (action: TransactionAction) => {
    if (selectedIds.size === 0) {
      toast.error("حداقل یک کاربر را انتخاب کنید");
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("مبلغ معتبر وارد کنید");
      return;
    }

    try {
      setSubmitting(true);
      await transferWalletForUsersBulk({
        userIds: Array.from(selectedIds),
        amount: parsedAmount,
        action,
        currency: "IRR",
      });

      toast.success(
        action === "deposit"
          ? "واریز با موفقیت انجام شد"
          : "برداشت با موفقیت انجام شد"
      );

      // Important: update the actor's own wallet balance shown in the header immediately.
      // Relying only on realtime can feel delayed/unreliable.
      try {
        await refreshWalletBalances?.();
      } catch (err) {
        console.warn("[TransactionsManager] refreshWalletBalances failed", err);
      }

      // بعد از موفقیت، لیست را دوباره بارگذاری می‌کنیم
      const result = await loadManagedUsers({ roleFilter: "all", search: "", force: true });
      setBaseUsers(result.users);
      setSelectedIds(new Set());
      setAmountInput("");

      // بارگذاری مجدد موجودی‌ها از همان دیتای refreshed users
      const { playersTotal, agentsTotal, supersTotal } = getTotalsFromManagedUsers(result.users);
      setTotalPlayersBalance(playersTotal);
      setTotalAgentsBalance(agentsTotal);
      setTotalSupersBalance(supersTotal);
    } catch (err: any) {
      console.error("Transaction action error:", err);
      toast.error(err?.message || "خطا در انجام تراکنش");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen bg-[#0E0E0F] text-white flex flex-col overflow-hidden">
      {/* محتوای اصلی */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="max-w-md mx-auto w-full h-full flex flex-col overflow-hidden">
          {/* بخش ثابت بالا */}
          <div className="flex-shrink-0 p-4 pb-0">
            {/* تب‌ها: سوابق / پیشخوان / برداشت */}
            <div className="flex mb-4 rounded-2xl overflow-hidden bg-[#111827] text-sm font-semibold">
              <button
                className={`flex-1 py-3 ${
                  tab === "history" ? "bg-teal-500 text-black" : "text-gray-300"
                }`}
                onClick={() => setTab("history")}
              >
                سوابق
              </button>
              <button
                className={`flex-1 py-3 ${
                  tab === "cashdesk" ? "bg-teal-500 text-black" : "text-gray-300"
                }`}
                onClick={() => setTab("cashdesk")}
              >
                پیشخوان
              </button>
              {canAccessWithdrawalsTab ? (
                <button
                  className={`flex-1 py-3 ${
                    tab === "withdrawals"
                      ? "bg-teal-500 text-black"
                      : "text-gray-300"
                  }`}
                  onClick={() => setTab("withdrawals")}
                >
                  برداشت
                </button>
              ) : null}
            </div>
          </div>

          {/* محتوای قابل اسکرول */}
          {tab === "history" ? (
            <>
              {/* بخش ثابت: Search bar و Date filters */}
              <div className="flex-shrink-0 px-4">
                {/* Search bar */}
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search Member"
                      value={historySearch}
                      onChange={handleHistorySearchChange}
                      className="w-full rounded-2xl bg-[#1f2933] text-sm text-white px-4 py-3 pr-10 outline-none border border-transparent focus:border-teal-500 placeholder:text-gray-400"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                      🔍
                    </div>
                  </div>
                </div>

                {/* Date filters */}
                <div className="flex mb-3 rounded-2xl bg-[#111827] overflow-hidden text-sm font-semibold">
                  <button
                    className={`flex-1 py-2 ${
                      historyDateFilter === "month"
                        ? "bg-teal-500 text-black"
                        : "text-gray-300"
                    }`}
                    onClick={() => setHistoryDateFilter("month")}
                  >
                    ماه
                  </button>
                  <button
                    className={`flex-1 py-2 ${
                      historyDateFilter === "week"
                        ? "bg-teal-500 text-black"
                        : "text-gray-300"
                    }`}
                    onClick={() => setHistoryDateFilter("week")}
                  >
                    هفته
                  </button>
                  <button
                    className={`flex-1 py-2 ${
                      historyDateFilter === "day"
                        ? "bg-teal-500 text-black"
                        : "text-gray-300"
                    }`}
                    onClick={() => setHistoryDateFilter("day")}
                  >
                    روز
                  </button>
                </div>

                {/* Type filters */}
                <div
                  className="mb-3 flex flex-wrap gap-x-2 gap-y-1.5 px-1"
                  role="group"
                  aria-label="فیلتر نوع تراکنش"
                >
                  {TRANSACTION_HISTORY_LEGEND.map((item) => {
                    const selected = historyTypeFilters.has(item.legendKey);
                    return (
                      <button
                        key={item.legendKey}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleHistoryTypeFilter(item.legendKey)}
                        className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] transition-colors ${
                          selected ? "text-white" : "text-gray-400 hover:text-gray-200"
                        }`}
                        style={{
                          borderColor: selected ? item.color : `${item.color}40`,
                          backgroundColor: selected ? `${item.color}4D` : `${item.color}24`,
                        }}
                      >
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                          aria-hidden
                        />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transaction list - قابل اسکرول */}
              <div className="flex-1 overflow-y-auto px-4 space-y-2">
                {historyLoading ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    در حال بارگذاری...
                  </div>
                ) : displayedHistoryTransactions.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    تراکنشی برای نمایش وجود ندارد
                  </div>
                ) : (
                  displayedHistoryTransactions.map((tx) => {
                    const isDepositLike =
                      tx.type === "deposit" ||
                      tx.type === "gateway_deposit" ||
                      tx.type === "crypto_deposit";
                    const isWithdrawalLike =
                      tx.type === "withdrawal_request" ||
                      tx.type === "crypto_withdrawal";
                    const formattedDate = formatTransactionDate(tx.createdAt);
                    const fromShortIdFormatted = `${tx.fromShortId.slice(0, 4)}-${
                      tx.fromShortId.length > 4 ? tx.fromShortId.slice(4) : ""
                    }`;
                    const toShortIdFormatted = `${tx.toShortId.slice(0, 4)}-${
                      tx.toShortId.length > 4 ? tx.toShortId.slice(4) : ""
                    }`;
                    const indicator = getTransactionHistoryIndicator(tx);

                    return (
                      <div
                        key={tx.id}
                        className="flex items-stretch bg-[#1f2933] rounded-2xl overflow-hidden"
                        title={indicator.label}
                      >
                        <div
                          className="w-1.5 flex-shrink-0 self-stretch min-h-[72px]"
                          style={{ backgroundColor: indicator.color }}
                          aria-hidden
                        />
                        <div className="flex flex-1 items-center justify-between px-3 py-3 min-w-0">
                        {/* From user (left) */}
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-white">
                            {tx.fromUsername}
                          </span>
                          <span className="text-xs text-gray-400">
                            ID : {fromShortIdFormatted}
                          </span>
                        </div>

                        {/* Middle: Date and amount */}
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-gray-400 mb-1" dir="ltr">
                            {formattedDate}
                          </span>
                          <div className="flex items-center gap-1">
                            {isWithdrawalLike ? (
                              <>
                                <span className="text-blue-400 text-lg">→</span>
                                <span className="numeric-text numeric-text--14 text-blue-400 font-semibold" dir="ltr">
                                  -{tx.amount.toLocaleString("en-US")}
                                </span>
                              </>
                            ) : isDepositLike ? (
                              <>
                                <span className="text-red-500 text-lg">→</span>
                                <span className="numeric-text numeric-text--14 text-red-500 font-semibold" dir="ltr">
                                  -{tx.amount.toLocaleString("en-US")}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-green-500 text-lg">←</span>
                                <span className="numeric-text numeric-text--14 text-green-500 font-semibold" dir="ltr">
                                  +{tx.amount.toLocaleString("en-US")}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* To user (right) */}
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-semibold text-white">
                            {tx.toUsername}
                          </span>
                          <span className="text-xs text-gray-400">
                            ID : {toShortIdFormatted}
                          </span>
                        </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : tab === "withdrawals" ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {showWithdrawalKindTabs ? (
                <div className="flex-shrink-0 px-4 pb-3">
                  <div className="flex rounded-2xl overflow-hidden bg-[#111827] text-sm font-semibold">
                    {canAccessRialWithdrawals ? (
                      <button
                        type="button"
                        className={`flex-1 py-2 ${
                          withdrawalKindFilter === "rial"
                            ? "bg-teal-500 text-black"
                            : "text-gray-300"
                        }`}
                        onClick={() => setWithdrawalKindFilter("rial")}
                      >
                        ریالی
                      </button>
                    ) : null}
                    {canAccessCryptoWithdrawals ? (
                      <button
                        type="button"
                        className={`flex-1 py-2 ${
                          withdrawalKindFilter === "crypto"
                            ? "bg-teal-500 text-black"
                            : "text-gray-300"
                        }`}
                        onClick={() => setWithdrawalKindFilter("crypto")}
                      >
                        رمز ارزی
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
              {withdrawalsLoading ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  در حال بارگذاری...
                </div>
              ) : withdrawalRequests.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  درخواست برداشت در انتظار بررسی وجود ندارد
                </div>
              ) : (
                withdrawalRequests.map((req) => {
                  const isReviewing = reviewingRequestId === req.id;
                  const isProcessing = processingRequestId === req.id;
                  const kind = req.kind ?? withdrawalKindFilter;
                  const reviewNote = reviewNotes[req.id] || "";
                  const canApprove =
                    reviewNote.trim().length > 0 && !isReviewing && !isProcessing;
                  const canReject = !isReviewing;
                  const canMarkProcessing =
                    req.status === "pending" && !isReviewing && !isProcessing;
                  const showPayoutDetails = req.status !== "pending";
                  return (
                    <div
                      key={req.id}
                      className="bg-[#1f2933] rounded-2xl px-4 py-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            {req.playerUsername || "پلیر"}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatTransactionDate(req.createdAt)}
                          </p>
                          <p className="text-xs text-amber-300/90 mt-1">
                            {getWithdrawalStatusLabel(req.status)}
                          </p>
                        </div>
                        <div className="text-xs text-gray-300 space-y-1 shrink-0">
                          <p className="flex w-full items-center justify-between gap-2" dir="ltr">
                            <span className="numeric-text numeric-text--12 text-white" dir="ltr">
                              {(req.playerWeekGamesPlayed ?? 0).toLocaleString("en-US")}
                            </span>
                            <span className="text-gray-400">
                              تعداد بازی (۷ روز گذشته):
                            </span>
                          </p>
                          <p className="flex w-full items-center justify-between gap-2" dir="ltr">
                            <span>
                              <span className="numeric-text numeric-text--12 text-white" dir="ltr">
                                {(req.playerWeekTotalWinnings ?? 0).toLocaleString("en-US")}
                              </span>
                              <span> تومان</span>
                            </span>
                            <span className="text-gray-400">
                              جمع برد (۷ روز گذشته):
                            </span>
                          </p>
                        </div>
                      </div>

                      {kind === "crypto" ? (
                        <div className="text-xs text-gray-300 space-y-1">
                          <p>
                            <span className="text-gray-400">شبکه: </span>
                            {req.network ? getNetworkLabel(req.network) : "—"}
                          </p>
                          <p>
                            <span className="text-gray-400">بلاک تومانی: </span>
                            <span className="numeric-text numeric-text--12" dir="ltr">
                              {req.amount.toLocaleString("en-US")}
                            </span>
                          </p>
                          {showPayoutDetails ? (
                            <p className="flex items-center justify-between gap-2">
                              <span className="break-all text-left" dir="ltr">
                                <span className="text-gray-400">آدرس: </span>
                                {req.walletAddress}
                              </span>
                              <button
                                type="button"
                                onClick={() => void copyWalletAddress(req.walletAddress || "")}
                                className="flex-shrink-0 rounded-lg border border-gray-600 px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-[#374151]"
                              >
                                کپی
                              </button>
                            </p>
                          ) : null}
                        </div>
                      ) : showPayoutDetails ? (
                        <div className="text-xs text-gray-300 space-y-1">
                          <p>
                            <span className="text-gray-400">نام: </span>
                            {req.fullName}
                          </p>
                          <p className="flex items-center justify-between gap-2">
                            <span className="numeric-text numeric-text--16 text-white" dir="ltr">
                              {formatCardDisplay(req.cardNumber || "")}
                            </span>
                            <button
                              type="button"
                              onClick={() => void copyCardNumber(req.cardNumber || "")}
                              className="flex-shrink-0 rounded-lg border border-gray-600 px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-[#374151]"
                            >
                              کپی
                            </button>
                          </p>
                          {req.shebaNumber ? (
                            <p className="flex items-center justify-between gap-2">
                              <span className="numeric-text numeric-text--16 text-white break-all text-left" dir="ltr">
                                {formatShebaDisplay(req.shebaNumber)}
                              </span>
                              <button
                                type="button"
                                onClick={() => void copyShebaNumber(req.shebaNumber || "")}
                                className="flex-shrink-0 rounded-lg border border-gray-600 px-2 py-1 text-[11px] font-semibold text-gray-200 hover:bg-[#374151]"
                              >
                                کپی
                              </button>
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {showPayoutDetails ? (
                        <p className="text-xs text-gray-300">
                          <span className="text-gray-400">مبلغ درخواستی: </span>
                          {kind === "crypto" ? (
                            <span className="numeric-text numeric-text--16 text-yellow-300" dir="ltr">
                              {(req.cryptoAmount ?? 0).toLocaleString("en-US")}{" "}
                              {req.cryptoSymbol}
                            </span>
                          ) : (
                            <>
                              <span className="numeric-text numeric-text--16 text-yellow-300" dir="ltr">
                                {req.amount.toLocaleString("en-US")}
                              </span>
                              <span className="text-yellow-300"> تومان</span>
                            </>
                          )}
                        </p>
                      ) : null}

                      <button
                        type="button"
                        disabled={!canMarkProcessing}
                        onClick={() => void handleMarkProcessing(req.id, kind)}
                        className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm disabled:opacity-60"
                      >
                        {isProcessing
                          ? "..."
                          : kind === "crypto"
                            ? "در حال انجام"
                            : "مشاهده مشخصات کارت"}
                      </button>

                      <label className="block pt-1">
                        <span className="text-xs text-gray-400 mb-1.5 block">
                          توضیحات(الزامی)
                        </span>
                        <WithdrawalReviewNoteTextarea
                          value={reviewNote}
                          onChange={(nextValue) =>
                            setReviewNotes((prev) => ({
                              ...prev,
                              [req.id]: nextValue,
                            }))
                          }
                          disabled={isReviewing}
                        />
                      </label>

                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!canApprove}
                          onClick={() => void handleWithdrawalReview(req.id, "approve", kind)}
                          className="flex-1 py-2.5 rounded-xl bg-teal-500 text-black font-semibold text-sm disabled:opacity-60"
                        >
                          {isReviewing ? "..." : "تایید درخواست"}
                        </button>
                        <button
                          type="button"
                          disabled={!canReject}
                          onClick={() => void handleWithdrawalReview(req.id, "reject", kind)}
                          className="flex-1 py-2.5 rounded-xl bg-red-700 text-white font-semibold text-sm disabled:opacity-60"
                        >
                          {isReviewing ? "..." : "رد درخواست"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden px-4">
              {/* بخش ثابت: موجودی‌ها، فیلتر نقش، نوار جستجو */}
              <div className="flex-shrink-0 pt-0">
                {/* خلاصه موجودی‌ها */}
                <div className="mb-4">
                  <div className="flex gap-1">
                    {/* موجودی ایجنت‌ها - برای admin/super/agent نمایش داده می‌شود */}
                    {currentUserRole !== "player" && (
                      <div className="flex-1 bg-[#1f2933] rounded-xl px-1 py-1 flex flex-col items-center justify-center">
                        <span className="text-white text-xs mb-1.5">موجودی ایجنت‌ها</span>
                        <div className="bg-[#374151] rounded-lg px-1 py-1 w-full text-center">
                          <span className="text-yellow-300 font-mono text-sm font-semibold">
                            {typeof totalAgentsBalance === 'number' ? totalAgentsBalance.toLocaleString("en-US") : '0'}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* موجودی سوپرها - فقط برای admin نمایش داده می‌شود */}
                    {currentUserRole === "admin" && (
                      <div className="flex-1 bg-[#1f2933] rounded-xl px-1 py-1 flex flex-col items-center justify-center">
                        <span className="text-white text-xs mb-1.5">موجودی سوپرها</span>
                        <div className="bg-[#374151] rounded-lg px-1 py-1 w-full text-center">
                          <span className="text-yellow-300 font-mono text-sm font-semibold">
                            {typeof totalSupersBalance === 'number' ? totalSupersBalance.toLocaleString("en-US") : '0'}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {/* موجودی پلیرها */}
                    <div className="flex-1 bg-[#1f2933] rounded-xl px-1 py-1 flex flex-col items-center justify-center">
                      <span className="text-white text-xs mb-1.5">موجودی پلیرها</span>
                      <div className="bg-[#374151] rounded-lg px-1 py-1 w-full text-center">
                        <span className="text-yellow-300 font-mono text-sm font-semibold">
                          {typeof totalPlayersBalance === 'number' ? totalPlayersBalance.toLocaleString("en-US") : '0'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* فیلتر نقش + تعداد کاربران */}
                {currentUserRole !== "player" && (
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex flex-1 rounded-2xl bg-[#111827] overflow-hidden text-sm font-semibold">
                      {roleTabs.map((tabItem) => (
                        <button
                          key={tabItem.key}
                          onClick={() => setRoleFilter(tabItem.key)}
                          className={`flex-1 py-2 ${
                            roleFilter === tabItem.key
                              ? "bg-teal-500 text-black"
                              : "text-gray-300"
                          }`}
                        >
                          {tabItem.label}
                        </button>
                      ))}
                    </div>
                    <div className="ml-3 text-sm text-gray-300">
                      <span>{totalUsers}</span>
                    </div>
                  </div>
                )}
                {currentUserRole === "player" && (
                  <div className="flex items-center justify-end mb-3">
                    <div className="text-sm text-gray-300">
                      <span>تعداد کاربر: {totalUsers}</span>
                    </div>
                  </div>
                )}

                {/* Search bar و انتخاب همه */}
                <div className="mb-3">
                  <div className="flex items-center gap-3">
                    {/* Checkbox انتخاب همه */}
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className={`w-5 h-[21px] rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
                        allSelected
                          ? "border-teal-400 bg-[#0f766e]"
                          : "border-gray-500 bg-transparent"
                      }`}
                    >
                      {allSelected && <div className="w-3 h-3 rounded-sm bg-white" />}
                    </button>
                    
                    {/* Search bar */}
                    <div className="relative flex-1">
                      <input
                        type="text"
                        placeholder="Search Member"
                        value={search}
                        onChange={handleSearchChange}
                        className="w-full rounded-2xl bg-[#1f2933] text-sm text-white px-4 py-3 pr-10 outline-none border border-transparent focus:border-teal-500 placeholder:text-gray-400"
                      />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400">
                        🔍
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* لیست کاربران - قابل اسکرول */}
              <div className="flex-1 overflow-y-auto pb-32 space-y-2">
                {loading ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    در حال بارگذاری...
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    کاربری برای نمایش وجود ندارد
                  </div>
                ) : (
                  users.map((u) => {
                    const checked = selectedIds.has(u.id);
                    return (
                      <div
                        key={u.id}
                        className="flex items-center justify-between bg-[#1f2933] rounded-2xl px-3 py-3"
                      >
                        <div className="flex items-center gap-3">
                          {/* Checkbox */}
                          <button
                            type="button"
                            onClick={() => toggleSelect(u.id)}
                            className={`w-5 h-[21px] rounded-md border-2 flex items-center justify-center ${
                              checked
                                ? "border-teal-400 bg-[#0f766e]"
                                : "border-gray-500 bg-transparent"
                            }`}
                          >
                            {checked && <div className="w-3 h-3 rounded-sm bg-white" />}
                          </button>

                        {/* فقط نام کاربری/نمایشی */}
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold">
                            {renderUserLabel(u)}
                          </span>
                        </div>
                        </div>

                        {/* موجودی فعلی */}
                        <div className="flex items-center gap-2 bg-[#374151] rounded-xl px-3 py-1">
                          <span className="text-sm font-mono text-white">
                            {u.tomanBalance.toLocaleString("en-US")}
                          </span>
                        </div>
                      </div>
                    );
                  }                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* نوار پایین برای وارد کردن مبلغ و دکمه‌ها - همیشه در پایین صفحه */}
      {tab === "cashdesk" && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0E0E0F] border-t border-gray-800 py-3">
          <div className="max-w-md mx-auto px-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-300">مبلغ</span>
              <div className="flex items-center bg-[#374151] rounded-2xl px-3 py-2 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formattedAmountValue}
                  onChange={handleAmountChange}
                  className="bg-transparent outline-none text-right text-sm font-mono text-white w-28"
                  placeholder="0"
                />
                <span className="text-xs text-yellow-300">T</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleAction("withdraw")}
                disabled={submitting}
                className="flex-1 py-3 rounded-2xl bg-red-700 text-white font-semibold text-base disabled:opacity-60"
              >
                برداشت
              </button>
              <button
                type="button"
                onClick={() => handleAction("deposit")}
                disabled={submitting}
                className="flex-1 py-3 rounded-2xl bg-teal-500 text-black font-semibold text-base disabled:opacity-60"
              >
                واریز
              </button>
            </div>

            {selectedCount > 0 && (
              <div className="mt-2 text-xs text-gray-400 text-center">
                {selectedCount} کاربر انتخاب شده‌اند
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


