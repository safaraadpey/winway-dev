"use client";

import { useEffect, useMemo, useState } from "react";
import { loadManagedUsers } from "@/services/users";
import {
  adjustWalletForUsersBulk,
  transferWalletForUsersBulk,
  loadTransactionHistory,
} from "@/services/transactions";
import { supabase } from "@/lib/supabaseClient";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import type {
  ManagedUserRoleFilter,
  ManagedUserSummary,
} from "@/src/types/users";
import type {
  TransactionAction,
  TransactionHistoryItem,
  DateFilter,
} from "@/src/types/transactions";
import toast from "react-hot-toast";

const ALL_ROLE_TABS: { key: ManagedUserRoleFilter; label: string }[] = [
  { key: "player", label: "پلیر" },
  { key: "agent", label: "ایجنت" },
  { key: "super", label: "سوپر" },
  { key: "all", label: "همه" },
];

type TabMode = "cashdesk" | "history";

interface TransactionsManagerProps {
  pageTitle?: string;
}

// Helper function برای محاسبه موجودی کل پلیرها، ایجنت‌ها و سوپرها
async function fetchTotalBalances(): Promise<{
  playersTotal: number;
  agentsTotal: number;
  supersTotal: number;
}> {
  try {
    // گرفتن نقش کاربر فعلی
    const {
      data: { user: authUser },
      error: authError,
    } = await supabase.auth.getUser();
    
    if (authError || !authUser) {
      console.error("fetchTotalBalances: auth error", authError);
      return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
    }

    const { data: currentUser, error: userError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    if (userError || !currentUser) {
      console.error("fetchTotalBalances: user error", userError);
      return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
    }

    let targetUserIds: string[] = [];

    // تعیین کاربران زیرمجموعه بر اساس نقش
    if (currentUser.role === "admin") {
      // admin: همه players، agents و super ها
      const { data: allUsers, error: allUsersError } = await supabase
        .from("users")
        .select("id, role")
        .in("role", ["player", "agent", "super"]);
      
      if (allUsersError) {
        console.error("fetchTotalBalances: allUsers error", allUsersError);
        return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
      }
      
      targetUserIds = (allUsers || []).map((u: any) => u.id);
    } else if (currentUser.role === "super") {
      // super: agents و players زیر این super
      // 1. گرفتن agents که parent_id آن‌ها این super است
      const { data: agentsData, error: agentsError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUser.id)
        .eq("role", "agent");

      if (agentsError) {
        console.error("fetchTotalBalances: agents for super error", agentsError);
        return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
      }

      const agentIds = (agentsData || []).map((a: any) => a.id);
      targetUserIds.push(...agentIds);

      // 2. گرفتن players مستقیم زیر این super (parent_id = super.id)
      const { data: directPlayersData, error: directPlayersError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUser.id)
        .eq("role", "player");

      if (directPlayersError) {
        console.error("fetchTotalBalances: direct players for super error", directPlayersError);
      } else {
        const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
        targetUserIds.push(...directPlayerIds);
      }

      // 3. گرفتن players که parent_id آن‌ها یکی از agents زیر این super است
      if (agentIds.length > 0) {
        const { data: playersData, error: playersError } = await supabase
          .from("users")
          .select("id")
          .in("parent_id", agentIds)
          .eq("role", "player");

        if (playersError) {
          console.error("fetchTotalBalances: players under agents for super error", playersError);
        } else {
          const playerIds = (playersData || []).map((p: any) => p.id);
          targetUserIds.push(...playerIds);
        }
      }

      // 4. همچنین از player_affiliation هم استفاده می‌کنیم (برای سازگاری)
      const { data: paRows, error: paError } = await supabase
        .from("player_affiliation")
        .select("user_id, agent_id")
        .eq("super_id", currentUser.id);

      if (!paError && paRows && paRows.length > 0) {
        const paPlayerIds = paRows.map((r: any) => r.user_id);
        const paAgentIds = paRows
          .map((r: any) => r.agent_id)
          .filter((id: string | null) => !!id);
        targetUserIds.push(...paPlayerIds, ...paAgentIds);
      }

      // حذف duplicates
      targetUserIds = Array.from(new Set(targetUserIds));
    } else if (currentUser.role === "agent") {
      // agent: players زیر این agent
      // 1. گرفتن players مستقیم زیر این agent (parent_id = agent.id)
      const { data: directPlayersData, error: directPlayersError } = await supabase
        .from("users")
        .select("id")
        .eq("parent_id", currentUser.id)
        .eq("role", "player");

      if (directPlayersError) {
        console.error("fetchTotalBalances: direct players for agent error", directPlayersError);
      } else {
        const directPlayerIds = (directPlayersData || []).map((p: any) => p.id);
        targetUserIds.push(...directPlayerIds);
      }

      // 2. همچنین از player_affiliation هم استفاده می‌کنیم (برای سازگاری)
      const { data: paRows, error: paError } = await supabase
        .from("player_affiliation")
        .select("user_id")
        .eq("agent_id", currentUser.id);

      if (!paError && paRows && paRows.length > 0) {
        const paPlayerIds = paRows.map((r: any) => r.user_id);
        targetUserIds.push(...paPlayerIds);
      }

      // حذف duplicates
      targetUserIds = Array.from(new Set(targetUserIds));
    }

    if (targetUserIds.length === 0) {
      return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
    }

    // گرفتن موجودی همه این کاربران
    const { data: wallets, error: walletsError } = await supabase
      .from("wallets")
      .select("user_id, balance, currency")
      .in("user_id", targetUserIds)
      .eq("currency", "IRR");

    // گرفتن نقش کاربران (شامل super ها برای admin)
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("id, role")
      .in("id", targetUserIds)
      .in("role", currentUser.role === "admin" ? ["player", "agent", "super"] : ["player", "agent"]);

    if (usersError) {
      console.error("fetchTotalBalances: usersData error", usersError);
      return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
    }

      if (walletsError) {
      console.error("fetchTotalBalances: wallets error", walletsError);
      // اگر wallets خطا داد، باز هم users را بررسی کنیم
      if (usersData) {
        let playersTotal = 0;
        let agentsTotal = 0;
        let supersTotal = 0;
        usersData.forEach((u: any) => {
          if (u.role === "player") playersTotal += 0;
          else if (u.role === "agent") agentsTotal += 0;
          else if (u.role === "super") supersTotal += 0;
        });
        return { playersTotal, agentsTotal, supersTotal };
      }
      return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
    }

    // ساخت map برای موجودی‌ها
    const walletMap = new Map<string, number>();
    (wallets || []).forEach((w: any) => {
      const uid = w.user_id as string;
      const bal =
        typeof w.balance === "string"
          ? parseFloat(w.balance) || 0
          : Number(w.balance) || 0;
      walletMap.set(uid, bal);
    });

    // ساخت map برای نقش‌ها
    const roleMap = new Map<string, string>();
    (usersData || []).forEach((u: any) => {
      roleMap.set(u.id, u.role);
    });

    let playersTotal = 0;
    let agentsTotal = 0;
    let supersTotal = 0;

    // محاسبه مجموع موجودی‌ها بر اساس نقش
    walletMap.forEach((balance, userId) => {
      const role = roleMap.get(userId);
      if (role === "player") {
        playersTotal += balance;
      } else if (role === "agent") {
        agentsTotal += balance;
      } else if (role === "super") {
        supersTotal += balance;
      }
    });

    // اگر کاربری wallet نداشت، باز هم باید در نظر گرفته شود (موجودی 0)
    roleMap.forEach((role, userId) => {
      if (!walletMap.has(userId)) {
        // این کاربر wallet ندارد، پس موجودی 0 است
        // نیازی به اضافه کردن نیست چون 0 + 0 = 0
      }
    });

    return { playersTotal, agentsTotal, supersTotal };
  } catch (err) {
    console.error("fetchTotalBalances: unexpected error", err);
    return { playersTotal: 0, agentsTotal: 0, supersTotal: 0 };
  }
}

export default function TransactionsManager({ pageTitle }: TransactionsManagerProps) {
  const { refreshWalletBalances } = useBalancesContext();
  const [tab, setTab] = useState<TabMode>("cashdesk");
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
  const [currentUserRole, setCurrentUserRole] = useState<string>("player");

  // فیلتر کردن تب‌ها بر اساس نقش کاربر فعلی
  const roleTabs = useMemo(() => {
    if (currentUserRole === "super") {
      // super: فقط همه، ایجنت، پلیر
      return ALL_ROLE_TABS.filter((tab) => tab.key !== "super");
    } else if (currentUserRole === "agent") {
      // agent: فقط همه و پلیر (چون agent فقط players زیرمجموعه دارد)
      return ALL_ROLE_TABS.filter((tab) => tab.key === "all" || tab.key === "player");
    }
    // admin: همه تب‌ها
    return ALL_ROLE_TABS;
  }, [currentUserRole]);

  // اگر super است و roleFilter روی "super" است، آن را به "all" تغییر بده
  // اگر agent است و roleFilter روی "agent" یا "super" است، آن را به "all" تغییر بده
  useEffect(() => {
    if (currentUserRole === "super" && roleFilter === "super") {
      setRoleFilter("all");
    } else if (currentUserRole === "agent" && (roleFilter === "agent" || roleFilter === "super")) {
      setRoleFilter("all");
    }
  }, [currentUserRole, roleFilter]);


  // بارگذاری موجودی کل پلیرها و ایجنت‌ها (مستقل از فیلتر)
  useEffect(() => {
    let isMounted = true;

    async function fetchBalances() {
      try {
        const { playersTotal, agentsTotal, supersTotal } = await fetchTotalBalances();
        if (isMounted) {
          setTotalPlayersBalance(playersTotal);
          setTotalAgentsBalance(agentsTotal);
          setTotalSupersBalance(supersTotal);
        }
      } catch (err) {
        console.error("Error loading balances:", err);
        if (isMounted) {
          setTotalPlayersBalance(0);
          setTotalAgentsBalance(0);
          setTotalSupersBalance(0);
        }
      }
    }

    fetchBalances();
    return () => {
      isMounted = false;
    };
  }, []); // فقط یک بار در mount

  useEffect(() => {
    let isMounted = true;

    async function fetch() {
      try {
        setLoading(true);
        const result = await loadManagedUsers({ roleFilter, search });
        if (!isMounted) return;
        setCurrentUserRole(result.currentUserRole);
        setUsers(result.users);
        // حذف انتخاب‌هایی که دیگر در لیست نیستند
        setSelectedIds((prev) => {
          const next = new Set<string>();
          result.users.forEach((u) => {
            if (prev.has(u.id)) next.add(u.id);
          });
          return next;
        });
      } catch (err) {
        console.error("Error loading managed users for transactions:", err);
        if (isMounted) {
          toast.error("خطا در بارگذاری کاربران");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetch();

    return () => {
      isMounted = false;
    };
  }, [roleFilter, search]);

  const totalUsers = users.length;
  const selectedCount = selectedIds.size;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleHistorySearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHistorySearch(e.target.value);
  };

  // بارگذاری تاریخچه تراکنش‌ها
  useEffect(() => {
    if (tab !== "history") return;

    let isMounted = true;

    async function fetchHistory() {
      try {
        setHistoryLoading(true);
        const result = await loadTransactionHistory({
          dateFilter: historyDateFilter,
          search: historySearch,
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
  }, [tab, historyDateFilter, historySearch]);

  // فرمت تاریخ برای نمایش
  const formatTransactionDate = (dateString: string): string => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  };

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
      const result = await loadManagedUsers({ roleFilter, search });
      setUsers(result.users);
      setSelectedIds(new Set());
      setAmountInput("");

      // بارگذاری مجدد موجودی‌ها
      const { playersTotal, agentsTotal, supersTotal } = await fetchTotalBalances();
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
            {/* تب‌ها: سوابق / پیشخوان */}
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
              </div>

              {/* Transaction list - قابل اسکرول */}
              <div className="flex-1 overflow-y-auto px-4 space-y-2">
                {historyLoading ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    در حال بارگذاری...
                  </div>
                ) : historyTransactions.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    تراکنشی برای نمایش وجود ندارد
                  </div>
                ) : (
                  historyTransactions.map((tx) => {
                    const isDeposit = tx.type === "deposit";
                    const isWithdraw = tx.type === "withdraw";
                    const formattedDate = formatTransactionDate(tx.createdAt);
                    const fromShortIdFormatted = `${tx.fromShortId.slice(0, 4)}-${
                      tx.fromShortId.length > 4 ? tx.fromShortId.slice(4) : ""
                    }`;
                    const toShortIdFormatted = `${tx.toShortId.slice(0, 4)}-${
                      tx.toShortId.length > 4 ? tx.toShortId.slice(4) : ""
                    }`;

                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between bg-[#1f2933] rounded-2xl px-3 py-3"
                      >
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
                          <span className="text-xs text-gray-400 mb-1">
                            {formattedDate}
                          </span>
                          <div className="flex items-center gap-1">
                            {isDeposit ? (
                              <>
                                <span className="text-red-500 text-lg">→</span>
                                <span className="text-red-500 font-semibold text-sm">
                                  -{tx.amount.toLocaleString("en-US")}
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="text-green-500 text-lg">←</span>
                                <span className="text-green-500 font-semibold text-sm">
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
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden px-4">
              {/* بخش ثابت: موجودی‌ها، فیلتر نقش، نوار جستجو */}
              <div className="flex-shrink-0 pt-0">
                {/* خلاصه موجودی‌ها */}
                <div className="mb-4">
                  <div className="flex gap-1">
                    {/* موجودی ایجنت‌ها - فقط برای admin و super نمایش داده می‌شود */}
                    {currentUserRole !== "agent" && (
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
                {currentUserRole !== "agent" && (
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
                {currentUserRole === "agent" && (
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
                      className={`w-7 h-7 rounded-md border-2 flex items-center justify-center flex-shrink-0 ${
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
                            className={`w-7 h-7 rounded-md border-2 flex items-center justify-center ${
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
                            {u.displayName || u.username}
                          </span>
                        </div>
                        </div>

                        {/* موجودی فعلی */}
                        <div className="flex items-center gap-2 bg-[#374151] rounded-xl px-3 py-1">
                          <span className="text-sm font-mono text-white">
                            {u.tomanBalance.toLocaleString("en-US")}
                          </span>
                          <span className="text-xs text-yellow-300">T</span>
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


