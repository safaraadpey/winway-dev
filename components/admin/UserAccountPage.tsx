"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  getCachedUserAccountData,
  loadUserAccountData,
  primeUserAccountDataCache,
  saveUserCommission,
  toggleUserSuspension,
  savePersonalNote,
  deletePersonalNote,
  changeUserRole,
} from "@/services/user-account";
import { clearManagedUsersCache } from "@/services/users";
import { transferWalletForUsersBulk } from "@/services/transactions";
import { supabase } from "@/lib/supabaseClient";
import toast from "react-hot-toast";
import type { TransactionAction } from "@/src/types/transactions";
import type { AdminSubRole } from "@/lib/auth-helpers";
import type {
  UserAccountData,
  UserAccountPeriod,
} from "@/src/types/user-account";

interface UserAccountPageProps {
  userId: string;
}

const PERIOD_LABELS: Record<UserAccountPeriod, string> = {
  day: "روز",
  week: "هفته",
  month: "ماه",
};

function formatShortId(shortId: string | null): string {
  if (!shortId) return "";
  return `${shortId.slice(0, 4)}-${shortId.slice(4)}`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "نامشخص";
  const date = new Date(dateString);
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const seconds = date.getSeconds().toString().padStart(2, "0");
  return `${hours}:${minutes}:${seconds} ${day}-${month}-${year}`;
}

function formatTransactionDate(dateString: string): string {
  const date = new Date(dateString);
  // استفاده از تقویم شمسی (ساده‌سازی شده - می‌توانید کتابخانه تبدیل تاریخ استفاده کنید)
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

export default function UserAccountPage({ userId }: UserAccountPageProps) {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const cached = getCachedUserAccountData(userId, { maxAgeMs: 30_000 });
  const [data, setData] = useState<UserAccountData | null>(() => cached);
  const [loading, setLoading] = useState(() => cached === null);
  const [activePeriod, setActivePeriod] = useState<UserAccountPeriod>("month");
  const [commissionPercent, setCommissionPercent] = useState<string>("");
  const [savingCommission, setSavingCommission] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [personalNote, setPersonalNote] = useState<string>("");
  const [savingNote, setSavingNote] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteInModal, setNoteInModal] = useState<string>("");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [changingRole, setChangingRole] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<"admin" | "super" | "agent" | "player" | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserParentId, setCurrentUserParentId] = useState<string | null>(null);
  const [adminZeroId, setAdminZeroId] = useState<string | null>(null);
  const [currentUserCommissionPercent, setCurrentUserCommissionPercent] = useState<number | null>(null);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const [showAdminSubRoleModal, setShowAdminSubRoleModal] = useState(false);
  const [selectedAdminSubRole, setSelectedAdminSubRole] = useState<AdminSubRole | null>(null);
  const [showRoleConfirmModal, setShowRoleConfirmModal] = useState(false);
  const [pendingRoleChange, setPendingRoleChange] = useState<{
    newRole: "player" | "agent" | "super" | "admin";
    adminSubRole: AdminSubRole | null;
    roleLabel: string;
    currentRoleLabel: string;
  } | null>(null);
  const [amountInput, setAmountInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  // گرفتن نقش کاربر فعلی
  useEffect(() => {
    async function fetchCurrentUserRole() {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          setCurrentUserId(currentUser.id);
          const roleFromMetadata = (currentUser.user_metadata as any)?.role;
          if (
            roleFromMetadata === "admin" ||
            roleFromMetadata === "super" ||
            roleFromMetadata === "agent" ||
            roleFromMetadata === "player"
          ) {
            setCurrentUserRole(roleFromMetadata);
          }
          const { data: userData } = await supabase
            .from("users")
            .select("role, parent_id")
            .eq("id", currentUser.id)
            .single();
          if (userData) {
            setCurrentUserRole(userData.role as "admin" | "super" | "agent" | "player");
            setCurrentUserParentId((userData as any).parent_id || null);

            // Load current user's commission percent (used for super->agent cap).
            const { data: commissionRow } = await supabase
              .from("user_commissions")
              .select("super_commission, agent_commission")
              .eq("user_id", currentUser.id)
              .maybeSingle();

            if (userData.role === "super") {
              const raw = (commissionRow as any)?.super_commission ?? null;
              setCurrentUserCommissionPercent(
                raw === null || raw === undefined ? null : Number(raw) * 100
              );
            } else if (userData.role === "agent") {
              const raw = (commissionRow as any)?.agent_commission ?? null;
              setCurrentUserCommissionPercent(
                raw === null || raw === undefined ? null : Number(raw) * 100
              );
            } else {
              setCurrentUserCommissionPercent(null);
            }
          }
          const { data: adminZero } = await supabase
            .from("users")
            .select("id")
            .eq("username", "adminzero")
            .eq("role", "admin")
            .single();
          if (adminZero?.id) {
            setAdminZeroId(adminZero.id);
          }
        }
      } catch (error) {
        console.error("Error fetching current user role:", error);
      }
    }
    fetchCurrentUserRole();
  }, []);

  // بستن dropdown با کلیک خارج از آن
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setShowRoleDropdown(false);
      }
    }

    if (showRoleDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [showRoleDropdown]);

  // When navigating between userIds without a full remount, sync state to cache immediately.
  useEffect(() => {
    const nextCached = getCachedUserAccountData(userId, { maxAgeMs: 30_000 });
    setData(nextCached);
    setLoading(nextCached === null);
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    async function fetchData() {
      try {
        if (!cached) setLoading(true);
        const result = await loadUserAccountData(userId, { maxAgeMs: 30_000, force: true });
        if (!isMounted) return;
        setData(result);
        // بارگذاری درصد کانیات
        if (result?.user.commissionPercent !== null && result?.user.commissionPercent !== undefined) {
          setCommissionPercent(result.user.commissionPercent.toString());
        } else {
          setCommissionPercent("");
        }
        // بارگذاری یادداشت شخصی
        if (result?.user.personalNote) {
          setPersonalNote(result.user.personalNote);
        } else {
          setPersonalNote("");
        }
      } catch (error) {
        console.error("Error loading user account data:", error);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  // Keep cache in sync with local edits while on the page.
  useEffect(() => {
    if (data) {
      primeUserAccountDataCache(userId, data);
    }
  }, [userId, data]);

  // Handler برای ذخیره درصد کانیات
  const handleSaveCommission = async () => {
    if (savingCommission || !data) return;
    if (!canEditCommission) {
      toast.error("فقط بالاسری مستقیم می‌تواند درصد کانیات را تغییر دهد");
      return;
    }

    const percentValue = parseFloat(commissionPercent);
    if (isNaN(percentValue) || percentValue < 0 || percentValue > maxCommissionPercent) {
      if ((currentUserRole === "super" || currentUserRole === "agent") && user.role === "agent") {
        toast.error(`درصد کانیات باید عددی بین 0 تا ${maxCommissionPercent} باشد`);
      } else {
        toast.error("درصد کانیات باید عددی بین 0 تا 100 باشد");
      }
      return;
    }

    try {
      setSavingCommission(true);
      const result = await saveUserCommission(userId, percentValue);
      
      if (result.success) {
        clearManagedUsersCache();
        // به‌روزرسانی state
        setData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            user: {
              ...prev.user,
              commissionPercent: percentValue,
            },
          };
        });
        
        toast.success("درصد کانیات با موفقیت ذخیره شد");
      } else {
        toast.error(result.error || "خطا در ذخیره درصد کانیات");
      }
    } catch (error) {
      console.error("Error saving commission:", error);
      toast.error("خطا در ذخیره درصد کانیات");
    } finally {
      setSavingCommission(false);
    }
  };

  // Handler برای باز کردن modal یادداشت
  const handleOpenNoteModal = () => {
    setNoteInModal(personalNote);
    setShowNoteModal(true);
  };

  // Handler برای بستن modal
  const handleCloseNoteModal = () => {
    setShowNoteModal(false);
    setNoteInModal("");
  };

  // Handler برای تغییر مبلغ
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, ""); // فقط اعداد
    setAmountInput(raw);
  };
  const formattedAmountValue = amountInput
    ? Number(amountInput).toLocaleString("en-US")
    : "";

  // Handler برای واریز/برداشت
  const handleTransaction = async (action: TransactionAction) => {
    const parsedAmount = amountInput ? parseInt(amountInput, 10) : 0;
    
    if (!parsedAmount || parsedAmount <= 0) {
      toast.error("مبلغ معتبر وارد کنید");
      return;
    }

    try {
      setSubmitting(true);
      await transferWalletForUsersBulk({
        userIds: [userId],
        amount: parsedAmount,
        action,
        currency: "IRR",
      });

      toast.success(
        action === "deposit"
          ? "واریز با موفقیت انجام شد"
          : "برداشت با موفقیت انجام شد"
      );

      // بارگذاری مجدد داده‌های کاربر
      const result = await loadUserAccountData(userId, { force: true });
      setData(result);
      setAmountInput("");
    } catch (err: any) {
      console.error("Transaction error:", err);
      toast.error(err?.message || "خطا در انجام تراکنش");
    } finally {
      setSubmitting(false);
    }
  };

  // آماده‌سازی تغییر نقش و نمایش مودال هشدار
  const handleRoleChange = (
    newRole: "player" | "agent" | "super" | "admin",
    adminSubRole?: AdminSubRole | null
  ) => {
    if (changingRole) return;
    if (!data) return;

    const currentRole = data.user.role;
    // اگر نقش همان است و admin نیست، یا اگر admin است و sub_role هم همان است
    if (currentRole === newRole) {
      if (newRole !== "admin") {
        setShowRoleDropdown(false);
        return;
      }
      // برای admin، باید sub_role را هم چک کنیم
      if (newRole === "admin" && adminSubRole !== undefined) {
        const currentSubRole = data.user.adminSubRole;
        const newSubRole = adminSubRole === "manager" ? null : adminSubRole;
        if (currentSubRole === newSubRole) {
          setShowRoleDropdown(false);
          return;
        }
      }
    }

    const roleLabels: Record<string, string> = {
      player: "پلیر",
      agent: "ایجنت",
      super: "سوپر",
      admin: "ادمین",
    };

    // اگر تبدیل به admin است، باید sub_role انتخاب شود
    if (newRole === "admin" && adminSubRole === undefined) {
      setShowAdminSubRoleModal(true);
      setShowRoleDropdown(false);
      return;
    }

    const displayAdminSubRole: AdminSubRole | null =
      adminSubRole == null || adminSubRole === "manager" ? null : adminSubRole;

    const roleLabel =
      newRole === "admin"
        ? adminSubRole === null || adminSubRole === "manager"
          ? "مدیر کل"
          : adminSubRole === "finance"
          ? "مدیر مالی"
          : adminSubRole === "support"
          ? "مدیر پشتیبانی"
          : "مدیر اتاق‌ها"
        : roleLabels[newRole];

    setPendingRoleChange({
      newRole,
      adminSubRole: displayAdminSubRole,
      roleLabel,
      currentRoleLabel: roleLabels[currentRole],
    });
    setShowRoleDropdown(false);
    setShowRoleConfirmModal(true);
  };

  // اجرای نهایی تغییر نقش بعد از تأیید در مودال
  const executeRoleChange = async () => {
    if (!pendingRoleChange || !data) return;

    const { newRole, adminSubRole, roleLabel } = pendingRoleChange;

    try {
      setChangingRole(true);
      const normalizedSubRole =
        newRole === "admin"
          ? adminSubRole === "manager" || adminSubRole === null
            ? null
            : adminSubRole
          : null;

      const result = await changeUserRole(userId, newRole, normalizedSubRole);

      if (result.success) {
        // به‌روزرسانی state
        setData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            user: {
              ...prev.user,
              role: newRole,
              adminSubRole:
                newRole === "admin" ? normalizedSubRole : null,
            },
          };
        });

        toast.success(`نقش کاربر با موفقیت به ${roleLabel} تغییر یافت`);
        setShowRoleDropdown(false);
        setShowAdminSubRoleModal(false);
        setSelectedAdminSubRole(null);
        setShowRoleConfirmModal(false);
        setPendingRoleChange(null);
      } else {
        toast.error(result.error || "خطا در تغییر نقش کاربر");
      }
    } catch (error) {
      console.error("Error changing role:", error);
      toast.error("خطا در تغییر نقش کاربر");
    } finally {
      setChangingRole(false);
    }
  };

  // Handler برای انتخاب sub_role و تبدیل به admin
  const handleSelectAdminSubRole = (subRole: AdminSubRole | null) => {
    setSelectedAdminSubRole(subRole);
    handleRoleChange("admin", subRole);
  };

  // تابع برای تعیین نقش‌های قابل انتخاب بر اساس نقش کاربر فعلی و نقش هدف
  const getAvailableRoles = (): Array<{ value: "player" | "agent" | "super" | "admin"; label: string; disabled: boolean; adminSubRoles?: Array<{ value: AdminSubRole | null; label: string }> }> => {
    if (!data || !currentUserRole) return [];

    const targetRole = data.user.role;
    const roles: Array<{ value: "player" | "agent" | "super" | "admin"; label: string; disabled: boolean; adminSubRoles?: Array<{ value: AdminSubRole | null; label: string }> }> = [
      { value: "player", label: "پلیر", disabled: false },
      { value: "agent", label: "ایجنت", disabled: false },
      { value: "super", label: "سوپر", disabled: false },
      { 
        value: "admin", 
        label: "ادمین", 
        disabled: false,
        adminSubRoles: [
          { value: null, label: "مدیر کل" },
          { value: "finance", label: "مدیر مالی" },
          { value: "support", label: "مدیر پشتیبانی" },
          { value: "room", label: "مدیر اتاق‌ها" },
        ]
      },
    ];

    // جلوگیری از تنزل نقش (نقش‌های پایین‌تر از نقش فعلی غیرفعال می‌شوند)
    if (targetRole === "super") {
      // Super نمی‌تواند به Agent یا Player تبدیل شود
      roles.find((r) => r.value === "agent")!.disabled = true;
      roles.find((r) => r.value === "player")!.disabled = true;
    } else if (targetRole === "agent") {
      // Agent نمی‌تواند به Player تبدیل شود
      roles.find((r) => r.value === "player")!.disabled = true;
      // Agent فقط می‌تواند به Super تبدیل شود (ارتقا)
      if (currentUserRole !== "admin") {
        // فقط Admin می‌تواند Agent را به Super تبدیل کند
        roles.find((r) => r.value === "super")!.disabled = true;
      }
    } else if (targetRole === "player") {
      // Player می‌تواند به Agent، Super یا Admin تبدیل شود (ارتقا)
      if (currentUserRole === "super") {
        // Super فقط می‌تواند Player را به Agent تبدیل کند
        roles.find((r) => r.value === "super")!.disabled = true;
        roles.find((r) => r.value === "admin")!.disabled = true;
      } else if (currentUserRole === "agent") {
        // Agent فقط می‌تواند Player را به Agent تبدیل کند
        roles.find((r) => r.value === "super")!.disabled = true;
        roles.find((r) => r.value === "admin")!.disabled = true;
      } else if (currentUserRole !== "admin") {
        // فقط Admin می‌تواند Player را به Super یا Admin تبدیل کند
        roles.find((r) => r.value === "super")!.disabled = true;
        roles.find((r) => r.value === "admin")!.disabled = true;
      }
      // اگر currentUserRole === "admin"، همه نقش‌ها فعال هستند
    } else if (targetRole === "admin") {
      // Admin نمی‌تواند نقش دیگری داشته باشد
      roles.forEach((r) => {
        if (r.value !== "admin") r.disabled = true;
      });
    }

    // Player نمی‌تواند نقش کسی را تغییر دهد
    if (currentUserRole === "player") {
      roles.forEach((r) => {
        r.disabled = true;
      });
    }

    // Agent فقط می‌تواند Player را به Agent تبدیل کند
    if (currentUserRole === "agent") {
      if (targetRole !== "player") {
        // Agent نمی‌تواند نقش کسی را تغییر دهد (به جز Player)
        roles.forEach((r) => {
          r.disabled = true;
        });
      } else {
        // Agent فقط می‌تواند Player را به Agent تبدیل کند
        roles.forEach((r) => {
          if (r.value !== "agent") r.disabled = true;
        });
      }
    }

    // Super فقط می‌تواند Player را به Agent تبدیل کند
    if (currentUserRole === "super") {
      if (targetRole !== "player") {
        // Super نمی‌تواند نقش کسی را تغییر دهد (به جز Player)
        roles.forEach((r) => {
          r.disabled = true;
        });
      } else {
        // Super فقط می‌تواند Player را به Agent تبدیل کند
        roles.forEach((r) => {
          if (r.value !== "agent") r.disabled = true;
        });
      }
    }

    // نقش فعلی را disable نکن (همیشه قابل انتخاب است)
    roles.forEach((r) => {
      if (r.value === targetRole) {
        r.disabled = false;
      }
    });

    return roles;
  };

  // Handler برای ذخیره یادداشت شخصی از modal
  const handleSaveNote = async () => {
    if (savingNote) return;

    try {
      setSavingNote(true);
      const trimmedNote = noteInModal.trim();
      
      if (trimmedNote.length === 0) {
        // اگر یادداشت خالی است، حذف کن
        const deleted = await deletePersonalNote(userId);
        if (deleted) {
          setPersonalNote("");
          setData((prev) => (prev ? { ...prev, user: { ...prev.user, personalNote: null } } : null));
          toast.success("یادداشت حذف شد");
          setShowNoteModal(false);
        }
      } else {
        // ذخیره یا به‌روزرسانی یادداشت
        const saved = await savePersonalNote(userId, trimmedNote);
        if (saved) {
          setPersonalNote(trimmedNote);
          setData((prev) => (prev ? { ...prev, user: { ...prev.user, personalNote: trimmedNote } } : null));
          toast.success("یادداشت با موفقیت ذخیره شد");
          setShowNoteModal(false);
        } else {
          toast.error("خطا در ذخیره یادداشت");
        }
      }
    } catch (error) {
      console.error("Error saving note:", error);
      toast.error("خطا در ذخیره یادداشت");
    } finally {
      setSavingNote(false);
    }
  };

  // تابع برای نمایش preview یادداشت (دو خط اول)
  const getNotePreview = (note: string): string => {
    if (!note) return "";
    const lines = note.split("\n");
    if (lines.length <= 2) return note;
    return lines.slice(0, 2).join("\n") + "...";
  };

  // Handler برای تعلیق/فعال‌سازی اکانت
  const handleToggleSuspension = async () => {
    if (suspending) return;

    const currentStatus = data?.user.isSuspended ? "suspended" : "active";
    const actionText = currentStatus === "suspended" ? "فعال‌سازی" : "تعلیق";
    
    if (!confirm(`آیا مطمئن هستید که می‌خواهید اکانت را ${actionText} کنید؟`)) {
      return;
    }

    try {
      setSuspending(true);
      const result = await toggleUserSuspension(userId);
      
      if (result.success) {
        // به‌روزرسانی state
        setData((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            user: {
              ...prev.user,
              isSuspended: result.newStatus === "suspended",
            },
          };
        });
        
        // نمایش پیغام موفقیت
        const statusText = result.newStatus === "suspended" ? "تعلیق شد" : "فعال شد";
        toast.success(`اکانت کاربر با موفقیت ${statusText}`);
      } else {
        toast.error(result.error || "خطا در تغییر وضعیت اکانت");
      }
    } catch (error) {
      console.error("Error toggling suspension:", error);
      toast.error("خطا در تغییر وضعیت اکانت");
    } finally {
      setSuspending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0E0E0F] p-4">
        <div className="max-w-md mx-auto">
          <div className="text-center py-8 text-gray-400">خطا در بارگذاری اطلاعات کاربر</div>
        </div>
      </div>
    );
  }

  const { user, activities, transactions } = data;
  const activity = activities[activePeriod];
  const canEditCommission =
    !!currentUserId &&
    (((currentUserRole === "super" || currentUserRole === "agent") &&
      user.role === "agent" &&
      (user.parentId === currentUserId || user.superId === currentUserId)) ||
      (currentUserRole === "admin" &&
        (user.role === "agent" || user.role === "super") &&
        (user.parentId === currentUserId ||
          (adminZeroId &&
            (currentUserId === adminZeroId ||
              currentUserParentId === adminZeroId) &&
            user.parentId === adminZeroId))));

  // Business rule: super/agent cannot set child-agent commission above their own commission.
  const maxCommissionPercent =
    (currentUserRole === "super" || currentUserRole === "agent") && user.role === "agent"
      ? Math.max(0, Math.min(100, currentUserCommissionPercent ?? 0))
      : 100;

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4 pb-32">
      <div className="max-w-md mx-auto">
        {/* اطلاعات کاربر */}
        <div className="mb-4">
          <div className="flex items-start gap-3 mb-3">
            {/* آواتار */}
            <div className="w-16 h-16 rounded-2xl bg-[#0b1120] flex items-center justify-center text-2xl font-bold text-white flex-shrink-0">
              {user.displayName?.[0]?.toUpperCase() || "U"}
            </div>

            {/* اطلاعات کاربر */}
            <div className="flex-1">
              <div className="text-lg font-semibold mb-1">{user.displayName}</div>
              {user.lastLoginAt && (
                <div className="text-xs text-gray-400">
                  آخرین ورود: {formatDate(user.lastLoginAt)}
                </div>
              )}
            </div>

            {/* موجودی‌ها */}
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono text-yellow-300">
                  {user.dingBalance.toLocaleString("en-US")}
                </span>
                <span className="text-base font-bold text-yellow-300">🪙</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-sm font-mono text-yellow-300">
                  {user.tomanBalance.toLocaleString("en-US")}
                </span>
                <span className="text-xs text-yellow-300">T</span>
              </div>
            </div>
          </div>

          {/* یادداشت شخصی و تعلیق اکانت */}
          <div className="mb-3">
            <div className="flex gap-3 mb-2">
              {/* Preview یادداشت شخصی (قابل کلیک) */}
              <button
                onClick={handleOpenNoteModal}
                className="flex-1 text-right py-2 px-3 rounded-xl bg-[#1f2933] text-sm text-gray-300 hover:bg-[#2a3441] transition-colors min-h-[3rem]"
              >
                {personalNote ? (
                  <div className="whitespace-pre-wrap line-clamp-2">
                    {getNotePreview(personalNote)}
                  </div>
                ) : (
                  <span className="text-gray-500">یادداشت شخصی...</span>
                )}
              </button>
              {/* دکمه تعلیق اکانت */}
              <button
                onClick={handleToggleSuspension}
                disabled={suspending}
                className="px-4 py-2 rounded-xl bg-red-700 text-sm text-white font-semibold hover:bg-red-800 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {suspending
                  ? "..."
                  : data?.user.isSuspended
                  ? "فعال‌سازی"
                  : "تعلیق اکانت"}
              </button>
            </div>
          </div>

        {/* نقش و ایجنت/سوپر */}
        <div className="mb-3">
          {/* کارت‌های ایجنت و سوپر (بالای بخش نقش) */}
          <div className="flex gap-3 mb-3">
              {user.agentId && (
                <div className="flex-1 rounded-xl bg-[#1f2933] p-3">
                  <div className="text-xs text-gray-400 mb-1">ایجنت بالاسری</div>
                  <div className="text-sm font-semibold mb-1">
                    {user.agentUsername || "نامشخص"}
                  </div>
                </div>
              )}
              {user.superId && (
                <div className="flex-1 rounded-xl bg-[#1f2933] p-3">
                  <div className="text-xs text-gray-400 mb-1">سوپر بالاسری</div>
                  <div className="text-sm font-semibold mb-1">
                    {user.superUsername || "نامشخص"}
                  </div>
                </div>
              )}
          </div>

          {/* سطر نمایش و تغییر نقش */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 relative" ref={roleDropdownRef}>
                <button
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                  disabled={changingRole || !currentUserRole || currentUserRole === "player"}
                  className="w-full py-2 rounded-xl bg-[#1f2933] text-sm text-gray-300 flex items-center justify-between px-3 hover:bg-[#2a3441] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>
                    {user.role === "player"
                      ? "پلیر"
                      : user.role === "agent"
                      ? "ایجنت"
                      : user.role === "super"
                      ? "سوپر"
                      : user.role === "admin"
                      ? user.adminSubRole === null || user.adminSubRole === "manager"
                        ? "مدیر کل"
                        : user.adminSubRole === "finance"
                        ? "مدیر مالی"
                        : user.adminSubRole === "support"
                        ? "مدیر پشتیبانی"
                        : user.adminSubRole === "room"
                        ? "مدیر اتاق‌ها"
                        : "ادمین"
                      : "نامشخص"}
                  </span>
                  <span className={showRoleDropdown ? "rotate-180" : ""}>▼</span>
                </button>
                {showRoleDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl bg-[#1f2933] border border-[#2a3441] overflow-hidden z-10 max-h-96 overflow-y-auto">
                    {getAvailableRoles().map((role) => {
                      if (role.value === "admin" && role.adminSubRoles) {
                        // برای admin، sub_role ها را نمایش می‌دهیم
                        return (
                          <div key={role.value}>
                            <div className="px-3 py-2 text-xs text-gray-400 border-b border-[#2a3441] bg-[#0b1120]">
                              {role.label}
                            </div>
                            {role.adminSubRoles.map((subRole) => {
                              const isSelected = user.role === "admin" && 
                                ((subRole.value === null && (user.adminSubRole === null || user.adminSubRole === "manager")) || 
                                 (subRole.value !== null && user.adminSubRole === subRole.value));
                              return (
                                <button
                                  key={subRole.value || "manager"}
                                  onClick={() => {
                                    if (!role.disabled) {
                                      handleRoleChange("admin", subRole.value);
                                    }
                                  }}
                                  disabled={role.disabled || changingRole}
                                  className={`w-full text-right py-2 px-3 text-sm transition-colors ${
                                    isSelected
                                      ? "bg-teal-600 text-white"
                                      : role.disabled
                                      ? "text-gray-600 cursor-not-allowed"
                                      : "text-gray-300 hover:bg-[#2a3441]"
                                  }`}
                                >
                                  {subRole.label}
                                  {isSelected && " ✓"}
                                </button>
                              );
                            })}
                          </div>
                        );
                      }
                      return (
                        <button
                          key={role.value}
                          onClick={() => {
                            if (!role.disabled && role.value !== user.role) {
                              handleRoleChange(role.value);
                            }
                          }}
                          disabled={role.disabled || role.value === user.role || changingRole}
                          className={`w-full text-right py-2 px-3 text-sm transition-colors ${
                            role.value === user.role
                              ? "bg-teal-600 text-white"
                              : role.disabled
                              ? "text-gray-600 cursor-not-allowed"
                              : "text-gray-300 hover:bg-[#2a3441]"
                          }`}
                        >
                          {role.label}
                          {role.value === user.role && " ✓"}
                        </button>
                      );
                    })}
                  </div>
                )}
            </div>
            <span className="text-sm text-gray-400">نقش</span>
          </div>

          {/* درصد کانیات (فقط برای ایجنت و سوپر) */}
            {(user.role === "agent" || user.role === "super") && (
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={handleSaveCommission}
                  disabled={savingCommission || !canEditCommission}
                  className="px-4 py-2 rounded-xl bg-teal-600 text-sm text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingCommission ? "..." : "ثبت"}
                </button>
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max={maxCommissionPercent}
                    step="0.01"
                    value={commissionPercent}
                    onChange={(e) => {
                      const value = e.target.value;
                      // فقط اعداد و نقطه اعشار مجاز
                      if (value === "" || /^\d*\.?\d*$/.test(value)) {
                        setCommissionPercent(value);
                      }
                    }}
                    disabled={savingCommission || !canEditCommission}
                    placeholder="0"
                    className="flex-1 py-2 px-3 rounded-xl bg-[#1f2933] text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50"
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
                <span className="text-sm text-gray-400">درصد کانیات</span>
                {(currentUserRole === "super" || currentUserRole === "agent") && user.role === "agent" && (
                  <span className="text-xs text-gray-500">
                    سقف مجاز: {maxCommissionPercent}%
                  </span>
                )}
                {!canEditCommission && (
                  <span className="text-xs text-gray-500">
                    فقط بالاسری مستقیم می‌تواند تغییر دهد
                  </span>
                )}
              </div>
            )}

          </div>
        </div>

        {/* آمار فعالیت */}
        <div className="rounded-2xl bg-[#151515] border border-gray-800 mb-6">
          <div className="grid grid-cols-3 text-center text-sm font-semibold">
            {(["day", "week", "month"] as UserAccountPeriod[]).map((period) => (
              <button
                key={period}
                onClick={() => setActivePeriod(period)}
                className={`py-3 ${
                  activePeriod === period ? "bg-teal-500 text-black" : "text-gray-300"
                }`}
              >
                {PERIOD_LABELS[period]}
              </button>
            ))}
          </div>
          <div className="px-4 py-3 text-sm text-gray-100">
            <div className="grid grid-cols-2 gap-y-1">
              {data?.user?.role === "player" && (
                <>
                  <span>تعداد برد خطی</span>
                  <span className="text-right font-mono">
                    {activity.lineWins.toLocaleString("en-US")}
                  </span>
                  <span>تعداد برد پر</span>
                  <span className="text-right font-mono">
                    {activity.fullWins.toLocaleString("en-US")}
                  </span>
                </>
              )}
              <span>کانیات</span>
              <span className="text-right font-mono">
                {activity.commission.toLocaleString("en-US")}
              </span>
              <span>کانیات کل</span>
              <span className="text-right font-mono">
                {activity.commissionTotal === null
                  ? "—"
                  : activity.commissionTotal.toLocaleString("en-US")}
              </span>
              <span>واریز</span>
              <span className="text-right font-mono">
                {activity.deposits.toLocaleString("en-US")}
              </span>
              <span>برداشت</span>
              <span className="text-right font-mono">
                {activity.withdrawals.toLocaleString("en-US")}
              </span>
              <span>بیلان</span>
              <span
                className={`text-right font-mono ${
                  activity.net >= 0 ? "text-green-400" : "text-red-400"
                }`}
              >
                {activity.net.toLocaleString("en-US")}
              </span>
            </div>
          </div>
        </div>

        {/* لیست تراکنش‌ها */}
        <div className="space-y-2">
          {transactions.length === 0 ? (
            <div className="text-center py-4 text-gray-400 text-sm">
              تراکنشی برای نمایش وجود ندارد
            </div>
          ) : (
            transactions.map((tx) => {
              // برای نمایش به کاربر: deposit = + و سبز ، withdraw = - و قرمز
              const isDeposit = tx.type === "deposit";
              const roleLabels: Record<string, string> = {
                admin: "ادمین",
                agent: "ایجنت",
                super: "سوپر",
              };

              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between bg-[#1f2933] rounded-2xl px-3 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">
                      {roleLabels[tx.actorRole]} ID : {formatShortId(tx.actorShortId)}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTransactionDate(tx.createdAt)}
                    </span>
                  </div>
                  <div
                    className={`text-sm font-mono ${
                      isDeposit ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {isDeposit ? "+" : "-"}
                    {tx.amount.toLocaleString("en-US")}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal یادداشت شخصی */}
      {showNoteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0b1120] rounded-2xl p-6 w-full max-w-md max-h-[80vh] flex flex-col">
            {/* هدر */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">یادداشت شخصی</h3>
              <button
                onClick={handleCloseNoteModal}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Textarea */}
            <textarea
              value={noteInModal}
              onChange={(e) => {
                const newText = e.target.value;
                if (newText.length <= 150) {
                  setNoteInModal(newText);
                }
              }}
              disabled={savingNote}
              placeholder="یادداشت شخصی در مورد کاربر..."
              rows={6}
              className="w-full py-3 px-4 rounded-xl bg-[#1f2933] text-sm text-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 mb-3"
              maxLength={150}
              autoFocus
            />

            {/* شمارنده کاراکتر */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-gray-500">
                {noteInModal.length} / 150 کاراکتر
              </span>
              {savingNote && (
                <span className="text-xs text-gray-500">در حال ذخیره...</span>
              )}
            </div>

            {/* دکمه‌ها */}
            <div className="flex gap-3">
              <button
                onClick={handleCloseNoteModal}
                disabled={savingNote}
                className="flex-1 py-2 rounded-xl bg-[#1f2933] text-sm text-gray-300 hover:bg-[#2a3441] transition-colors disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={handleSaveNote}
                disabled={savingNote}
                className="flex-1 py-2 rounded-xl bg-teal-600 text-sm text-white font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {savingNote ? "در حال ذخیره..." : "ذخیره"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تأیید تغییر نقش کاربر */}
      {showRoleConfirmModal && pendingRoleChange && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0b1120] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">هشدار تغییر نقش</h3>
              <button
                onClick={() => {
                  setShowRoleConfirmModal(false);
                  setPendingRoleChange(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mb-4 space-y-2 text-sm text-gray-200">
              <p>
                شما در حال تغییر نقش این کاربر هستید. این کار می‌تواند روی دسترسی‌ها،
                گزارش‌ها و روابط مالی او تأثیر بگذارد.
              </p>
              <p className="text-yellow-300 font-semibold">
                نقش فعلی: {pendingRoleChange.currentRoleLabel}
              </p>
              <p className="text-teal-300 font-semibold">
                نقش جدید: {pendingRoleChange.roleLabel}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                لطفاً فقط در صورت اطمینان کامل از این تغییر استفاده کنید.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowRoleConfirmModal(false);
                  setPendingRoleChange(null);
                }}
                disabled={changingRole}
                className="flex-1 py-2 rounded-xl bg-[#1f2933] text-sm text-gray-300 hover:bg-[#2a3441] transition-colors disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={executeRoleChange}
                disabled={changingRole}
                className="flex-1 py-2 rounded-xl bg-red-600 text-sm text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {changingRole ? "در حال اعمال..." : "تأیید تغییر نقش"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal انتخاب sub_role برای admin */}
      {showAdminSubRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0b1120] rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">انتخاب نوع مدیر</h3>
              <button
                onClick={() => {
                  setShowAdminSubRoleModal(false);
                  setSelectedAdminSubRole(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              {[
                { value: null, label: "مدیر کل" },
                { value: "finance" as AdminSubRole, label: "مدیر مالی" },
                { value: "support" as AdminSubRole, label: "مدیر پشتیبانی" },
                { value: "room" as AdminSubRole, label: "مدیر اتاق‌ها" },
              ].map((subRole) => (
                <button
                  key={subRole.value || "manager"}
                  onClick={() => handleSelectAdminSubRole(subRole.value)}
                  disabled={changingRole}
                  className="w-full text-right py-3 px-4 rounded-xl bg-[#1f2933] text-white hover:bg-[#2a3441] transition-colors disabled:opacity-50"
                >
                  {subRole.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* کامپوننت واریز و برداشت (ثابت در پایین صفحه) */}
      <div className="fixed left-0 right-0 bottom-0 bg-[#0E0E0F] border-t border-[#1f2933] z-40">
        <div className="max-w-md mx-auto p-4">
          <div className="mb-3">
            <div className="flex items-center justify-between bg-[#1f2933] rounded-2xl px-4 py-3">
              <span className="text-xs text-gray-400">مبلغ (تومان)</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={formattedAmountValue}
                  onChange={handleAmountChange}
                  className="bg-transparent outline-none text-right text-sm font-mono text-white w-28"
                  placeholder="0"
                  disabled={submitting}
                />
                <span className="text-xs text-yellow-300">T</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => handleTransaction("withdraw")}
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl bg-red-700 text-white font-semibold text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              برداشت
            </button>
            <button
              type="button"
              onClick={() => handleTransaction("deposit")}
              disabled={submitting}
              className="flex-1 py-3 rounded-2xl bg-teal-500 text-black font-semibold text-base disabled:opacity-60 disabled:cursor-not-allowed"
            >
              واریز
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

