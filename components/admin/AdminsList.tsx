"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { loadAdmins, changeAdminSubRole, toggleAdminStatus, updateAdminPermissions, deleteAdmin } from "@/services/admins";
import type { AdminSubRoleFilter, AdminSummary, AdminPermissionKey } from "@/src/types/admins";
import { PERMISSION_LABELS } from "@/src/types/admins";
import type { AdminSubRole } from "@/lib/auth-helpers";
import toast from "react-hot-toast";

interface AdminsListProps {
  pageTitle?: string;
}

const SUB_ROLE_TABS: { key: AdminSubRoleFilter; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "manager", label: "مدیر کل" },
  { key: "finance", label: "مالی" },
  { key: "support", label: "پشتیبانی" },
  { key: "room", label: "اتاق‌ها" },
];

function formatShortId(shortId: string): string {
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
  return `${hours}:${minutes} ${day}-${month}-${year}`;
}

const SUB_ROLE_LABELS: Record<AdminSubRole | "manager", string> = {
  manager: "مدیر کل",
  finance: "مالی",
  support: "پشتیبانی",
  room: "اتاق‌ها",
};

export default function AdminsList({ pageTitle }: AdminsListProps) {
  const router = useRouter();
  const { setShowHeader, setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [admins, setAdmins] = useState<AdminSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [subRoleFilter, setSubRoleFilter] = useState<AdminSubRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [suspending, setSuspending] = useState<string | null>(null);
  const [showRoleDropdown, setShowRoleDropdown] = useState<string | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState<string | null>(null);
  const [updatingPermissions, setUpdatingPermissions] = useState<string | null>(null);
  const [tempPermissions, setTempPermissions] = useState<Record<AdminPermissionKey, boolean> | null>(null);
  const roleDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setShowHeader(true);
    setShowBackButton(true);
    setOnBackClick(() => () => router.back());

    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowHeader, setShowBackButton, setOnBackClick, router]);

  useEffect(() => {
    let isMounted = true;

    async function fetch() {
      try {
        setLoading(true);
        const result = await loadAdmins({ subRoleFilter, search });
        if (!isMounted) return;
        setAdmins(result.admins);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetch();

    return () => {
      isMounted = false;
    };
  }, [subRoleFilter, search]);

  // بستن dropdown نقش در صورت کلیک بیرون از آن
  useEffect(() => {
    if (!showRoleDropdown) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        roleDropdownRef.current &&
        !roleDropdownRef.current.contains(event.target as Node)
      ) {
        setShowRoleDropdown(null);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showRoleDropdown]);

  const totalCount = useMemo(() => admins.length, [admins]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleRoleChange = async (adminId: string, newSubRole: AdminSubRole | null) => {
    if (changingRole) return;

    try {
      setChangingRole(adminId);
      const result = await changeAdminSubRole(adminId, newSubRole);

      if (result.success) {
        // به‌روزرسانی state
        setAdmins((prev) =>
          prev.map((admin) =>
            admin.id === adminId ? { ...admin, adminSubRole: newSubRole } : admin
          )
        );
        toast.success("نقش مدیر با موفقیت تغییر یافت");
        setShowRoleDropdown(null);
      } else {
        toast.error(result.error || "خطا در تغییر نقش مدیر");
      }
    } catch (error) {
      console.error("Error changing role:", error);
      toast.error("خطا در تغییر نقش مدیر");
    } finally {
      setChangingRole(null);
    }
  };

  const handleOpenPermissionsModal = (admin: AdminSummary) => {
    setTempPermissions(admin.permissions || {
      rooms: true,
      users: true,
      transactions: true,
      entry_banner: true,
      admins: true,
    });
    setShowPermissionsModal(admin.id);
  };

  const handleClosePermissionsModal = () => {
    setShowPermissionsModal(null);
    setTempPermissions(null);
  };

  const handleTogglePermission = (key: AdminPermissionKey) => {
    if (!tempPermissions) return;
    setTempPermissions({
      ...tempPermissions,
      [key]: !tempPermissions[key],
    });
  };

  const handleSavePermissions = async (adminId: string) => {
    if (!tempPermissions || updatingPermissions) return;

    try {
      setUpdatingPermissions(adminId);
      const result = await updateAdminPermissions(adminId, tempPermissions);

      if (result.success) {
        // به‌روزرسانی state
        setAdmins((prev) =>
          prev.map((admin) =>
            admin.id === adminId ? { ...admin, permissions: tempPermissions } : admin
          )
        );
        toast.success("دسترسی‌های مدیر با موفقیت به‌روزرسانی شد");
        handleClosePermissionsModal();
      } else {
        toast.error(result.error || "خطا در به‌روزرسانی دسترسی‌ها");
      }
    } catch (error) {
      console.error("Error updating permissions:", error);
      toast.error("خطا در به‌روزرسانی دسترسی‌ها");
    } finally {
      setUpdatingPermissions(null);
    }
  };

  const handleToggleStatus = async (adminId: string) => {
    if (suspending) return;

    const admin = admins.find((a) => a.id === adminId);
    if (!admin) return;

    const actionText = admin.status === "suspended" ? "فعال‌سازی" : "تعلیق";

    if (!confirm(`آیا مطمئن هستید که می‌خواهید مدیر را ${actionText} کنید؟`)) {
      return;
    }

    try {
      setSuspending(adminId);
      const result = await toggleAdminStatus(adminId);

      if (result.success) {
        // به‌روزرسانی state
        setAdmins((prev) =>
          prev.map((admin) =>
            admin.id === adminId ? { ...admin, status: result.newStatus! } : admin
          )
        );
        const statusText = result.newStatus === "suspended" ? "تعلیق شد" : "فعال شد";
        toast.success(`مدیر با موفقیت ${statusText}`);
      } else {
        toast.error(result.error || "خطا در تغییر وضعیت مدیر");
      }
    } catch (error) {
      console.error("Error toggling status:", error);
      toast.error("خطا در تغییر وضعیت مدیر");
    } finally {
      setSuspending(null);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    const admin = admins.find((a) => a.id === adminId);
    if (!admin) return;

    if (
      !confirm(
        `آیا مطمئن هستید که می‌خواهید مدیر «${admin.username}» را حذف کنید؟ این کار اکانت را غیرفعال می‌کند.`
      )
    ) {
      return;
    }

    const result = await deleteAdmin(adminId);
    if (result.success) {
      setAdmins((prev) =>
        prev.map((a) =>
          a.id === adminId ? { ...a, status: "deleted" } : a
        )
      );
      toast.success("مدیر با موفقیت حذف شد");
    } else {
      toast.error(result.error || "خطا در حذف مدیر");
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <div className="max-w-md mx-auto">
        {/* تب‌های فیلتر sub_role */}
        <div className="flex mb-4 rounded-2xl overflow-hidden bg-[#111827] text-sm font-semibold">
          {SUB_ROLE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSubRoleFilter(tab.key)}
              className={`flex-1 py-3 ${
                subRoleFilter === tab.key
                  ? "bg-teal-500 text-black"
                  : "text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="mb-4">
          <div className="relative">
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

        {/* تعداد مدیران */}
        <div className="mb-4 text-sm text-gray-400">
          تعداد مدیران: {totalCount}
        </div>

        {/* لیست مدیران */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">در حال بارگذاری...</div>
        ) : admins.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            مدیری برای نمایش وجود ندارد
          </div>
        ) : (
          <div className="space-y-3">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="bg-[#1f2933] rounded-2xl p-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  {/* آواتار */}
                  <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-sky-500 to-blue-700 flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                    {admin.username[0]?.toUpperCase() || "A"}
                  </div>

                  {/* اطلاعات */}
                  <div className="flex-1 min-w-0">
                    <div className="text-base font-semibold text-white mb-1">
                      {admin.username}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Badge sub_role */}
                      <span className="px-2 py-0.5 rounded-lg bg-teal-600 text-white text-xs">
                        {SUB_ROLE_LABELS[admin.adminSubRole || "manager"]}
                      </span>
                      {/* Badge status */}
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs ${
                          admin.status === "active"
                            ? "bg-green-600 text-white"
                            : admin.status === "suspended"
                            ? "bg-red-600 text-white"
                            : "bg-gray-600 text-white"
                        }`}
                      >
                        {admin.status === "active"
                          ? "فعال"
                          : admin.status === "suspended"
                          ? "تعلیق شده"
                          : "حذف شده"}
                      </span>
                    </div>
                    {admin.lastLoginAt && (
                      <div className="text-xs text-gray-500 mt-1">
                        آخرین ورود: {formatDate(admin.lastLoginAt)}
                      </div>
                    )}
                  </div>
                </div>

                {/* دکمه‌های عملیات (چهار دکمه در یک ردیف در پایین کارت، با عرض پرکننده) */}
                <div className="mt-2 flex gap-2">
                  {/* دکمه تنظیم دسترسی‌ها */}
                  <button
                    onClick={() => handleOpenPermissionsModal(admin)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 transition-colors"
                  >
                    دسترسی‌ها
                  </button>
                  {/* Dropdown تغییر نقش */}
                  <div
                    className="relative flex-1"
                    ref={showRoleDropdown === admin.id ? roleDropdownRef : null}
                  >
                    <button
                      onClick={() =>
                        setShowRoleDropdown(
                          showRoleDropdown === admin.id ? null : admin.id
                        )
                      }
                      disabled={changingRole === admin.id}
                      className="w-full px-3 py-1.5 rounded-lg bg-[#374151] text-white text-xs hover:bg-[#4b5563] transition-colors disabled:opacity-50"
                    >
                      {changingRole === admin.id ? "..." : "نقش"}
                    </button>
                    {showRoleDropdown === admin.id && (
                      <div className="absolute right-0 top-full mt-1 rounded-lg bg-[#1f2933] border border-[#374151] overflow-hidden z-10 min-w-[140px] max-w-[80vw]">
                        {(["manager", "finance", "support", "room"] as const).map((role) => (
                          <button
                            key={role}
                            onClick={() => {
                              const newRole = role === "manager" ? null : role;
                              handleRoleChange(admin.id, newRole);
                            }}
                            disabled={changingRole === admin.id}
                            className={`w-full text-right py-2 px-3 text-xs transition-colors ${
                              (admin.adminSubRole === role ||
                                (admin.adminSubRole === null && role === "manager"))
                                ? "bg-teal-600 text-white"
                                : "text-gray-300 hover:bg-[#374151]"
                            }`}
                          >
                            {SUB_ROLE_LABELS[role]}
                            {(admin.adminSubRole === role ||
                              (admin.adminSubRole === null && role === "manager")) &&
                              " ✓"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* دکمه تعلیق/فعال‌سازی */}
                  <button
                    onClick={() => handleToggleStatus(admin.id)}
                    disabled={suspending === admin.id || admin.status === "deleted"}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      admin.status === "suspended"
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-red-600 text-white hover:bg-red-700"
                    }`}
                  >
                    {suspending === admin.id
                      ? "..."
                      : admin.status === "suspended"
                      ? "فعال"
                      : "تعلیق"}
                  </button>
                  {/* دکمه حذف */}
                  <button
                    onClick={() => handleDeleteAdmin(admin.id)}
                    disabled={admin.status === "deleted"}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-gray-700 text-white text-xs font-semibold hover:bg-gray-600 transition-colors disabled:opacity-40"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal تنظیم دسترسی‌ها */}
        {showPermissionsModal && tempPermissions && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              // بستن مودال در صورت کلیک روی پس‌زمینه (بیرون از باکس)
              if (e.target === e.currentTarget) {
                handleClosePermissionsModal();
              }
            }}
          >
            <div className="bg-[#0b1120] rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">تنظیم دسترسی‌ها</h3>
                <button
                  onClick={handleClosePermissionsModal}
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

              {/* محتوای اسکرول‌پذیر برای موبایل */}
              <div className="space-y-3 mb-4 flex-1 overflow-y-auto">
                {(Object.keys(PERMISSION_LABELS) as AdminPermissionKey[]).map((key) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 rounded-xl bg-[#1f2933]"
                  >
                    <span className="text-white text-sm">{PERMISSION_LABELS[key]}</span>
                    <button
                      onClick={() => handleTogglePermission(key)}
                      disabled={updatingPermissions === showPermissionsModal}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        tempPermissions[key]
                          ? "bg-teal-600"
                          : "bg-gray-600"
                      } relative`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          tempPermissions[key] ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleClosePermissionsModal}
                  disabled={updatingPermissions === showPermissionsModal}
                  className="flex-1 px-4 py-2 rounded-xl bg-gray-600 text-white hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  انصراف
                </button>
                <button
                  onClick={() => handleSavePermissions(showPermissionsModal)}
                  disabled={updatingPermissions === showPermissionsModal}
                  className="flex-1 px-4 py-2 rounded-xl bg-teal-600 text-white hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {updatingPermissions === showPermissionsModal ? "..." : "ذخیره"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

