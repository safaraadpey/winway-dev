"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { filterManagedUsers, getCachedManagedUsersBase, loadManagedUsers } from "@/services/users";
import type {
  ManagedUserRoleFilter,
  ManagedUserSummary,
} from "@/src/types/users";

interface ManagedUsersListProps {
  pageTitle?: string;
}

const ALL_ROLE_TABS: { key: ManagedUserRoleFilter; label: string }[] = [
  { key: "player", label: "پلیر" },
  { key: "agent", label: "ایجنت" },
  { key: "super", label: "سوپر" },
  { key: "all", label: "همه" },
];

export default function ManagedUsersList({ pageTitle }: ManagedUsersListProps) {
  const router = useRouter();
  const cached = getCachedManagedUsersBase();
  const [baseUsers, setBaseUsers] = useState<ManagedUserSummary[]>(
    () => cached?.usersAll ?? []
  );
  const [loading, setLoading] = useState(() => !cached);
  const [roleFilter, setRoleFilter] = useState<ManagedUserRoleFilter>("all");
  const [search, setSearch] = useState("");
  const [currentRole, setCurrentRole] = useState<string>(() => cached?.currentUserRole ?? "player");
  const [viewMode, setViewMode] = useState<"flat" | "tree">("flat");

  // فیلتر کردن تب‌ها بر اساس نقش کاربر فعلی
  const roleTabs = useMemo(() => {
    if (currentRole === "super") {
      // super: فقط همه، ایجنت، پلیر
      return ALL_ROLE_TABS.filter((tab) => tab.key !== "super");
    } else if (currentRole === "agent") {
      // agent: فقط همه و پلیر (چون agent فقط players زیرمجموعه دارد)
      return ALL_ROLE_TABS.filter((tab) => tab.key === "all" || tab.key === "player");
    }
    // admin: همه تب‌ها
    return ALL_ROLE_TABS;
  }, [currentRole]);

  // اگر super است و roleFilter روی "super" است، آن را به "all" تغییر بده
  // اگر agent است و roleFilter روی "agent" یا "super" است، آن را به "all" تغییر بده
  useEffect(() => {
    if (currentRole === "super" && roleFilter === "super") {
      setRoleFilter("all");
    } else if (currentRole === "agent" && (roleFilter === "agent" || roleFilter === "super")) {
      setRoleFilter("all");
    }
  }, [currentRole, roleFilter]);

  useEffect(() => {
    let isMounted = true;

    async function fetchBase() {
      try {
        setLoading(true);
        // Always fetch the base list once; filtering happens locally for fast tab switching.
        const result = await loadManagedUsers({ roleFilter: "all", search: "", maxAgeMs: 30_000 });
        if (!isMounted) return;
        setCurrentRole(result.currentUserRole);
        setBaseUsers(result.users);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    if (baseUsers.length === 0) {
      fetchBase();
    } else {
      // We already have cached base list; avoid loader flicker.
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const users = useMemo(() => {
    return filterManagedUsers(baseUsers, { roleFilter, search });
  }, [baseUsers, roleFilter, search]);

  const totalCount = useMemo(() => users.length, [users]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  // ساخت ساختار درختی از لیست کاربران بر اساس parentUserId
  type UserTreeNode = ManagedUserSummary & { children: UserTreeNode[] };

  const buildUserTree = (items: ManagedUserSummary[]): UserTreeNode[] => {
    const nodeMap = new Map<string, UserTreeNode>();
    const roots: UserTreeNode[] = [];

    // ابتدا همه نودها را بسازیم
    items.forEach((u) => {
      nodeMap.set(u.id, { ...u, children: [] });
    });

    // سپس روابط والد/فرزند را برقرار کنیم
    items.forEach((u) => {
      const node = nodeMap.get(u.id)!;
      const parentId = u.parentUserId;

      if (parentId && nodeMap.has(parentId)) {
        nodeMap.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });

    // مرتب‌سازی ریشه‌ها و فرزندان برای نمایش پایدار
    const sortNodes = (nodes: UserTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.role === b.role) {
          return a.username.localeCompare(b.username, "fa");
        }
        const order: ManagedUserRoleFilter[] = ["all"]; // dummy to satisfy TS, واقعی پایین‌تر
        const roleOrder: ("admin" | "super" | "agent" | "player")[] = [
          "admin",
          "super",
          "agent",
          "player",
        ];
        return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
      });
      nodes.forEach((n) => {
        if (n.children.length > 0) {
          sortNodes(n.children);
        }
      });
    };

    sortNodes(roots);
    return roots;
  };

  const treeRoots: UserTreeNode[] = useMemo(() => {
    if (viewMode !== "tree" || users.length === 0) return [];
    return buildUserTree(users);
  }, [viewMode, users]);

  const renderUserRow = (
    u: ManagedUserSummary | UserTreeNode,
    indentLevel: number = 0,
    options?: { onClickOverride?: () => void; disableNavigate?: boolean }
  ) => {
    const renderUserTitle = () => {
      const username = String(u.username || "").trim();
      const nickname = String((u as ManagedUserSummary).nickname || "").trim();
      if (!username) return <span>کاربر</span>;
      return (
        <span className="inline-flex items-center gap-1" dir="ltr">
          <span>{username}</span>
          {nickname ? <span className="text-gray-300">({nickname})</span> : null}
        </span>
      );
    };

    const paddingRight = 12 + indentLevel * 12;

    // رنگ پس‌زمینه کارت بر اساس نقش کاربر برای تشخیص سریع‌تر
    const bgClass =
      u.role === "super"
        ? "bg-[#2C3744]" // روشن‌تر برای سوپر جهت تفکیک بهتر
        : u.role === "agent"
        ? "bg-[#162137]" // تون آبی‌تر برای ایجنت
        : u.role === "player"
        ? "bg-[#1f2933]" // پیش‌فرض برای پلیر
        : "bg-[#1b1f2a]"; // ادمین

    const navigateToUser = () => {
      // تعیین مسیر بر اساس نقش کاربر فعلی
      if (currentRole === "agent") {
        router.push(`/agent/users/${u.id}`);
      } else {
        router.push(`/admin/users/${u.id}`);
      }
    };

    return (
      <button
        type="button"
        key={u.id}
        onClick={() => {
          // اگر handler اختصاصی برای کلیک داده شده، همان را اجرا می‌کنیم
          if (options?.onClickOverride) {
            options.onClickOverride();
            return;
          }

          // در صورت غیرفعال بودن ناوبری، هیچ مسیری عوض نشود
          if (options?.disableNavigate) {
            return;
          }

          navigateToUser();
        }}
        className={`w-full flex items-center justify-between ${bgClass} rounded-2xl px-3 py-3 hover:bg-[#2a3441] active:bg-[#1f2933] transition-colors`}
        style={{ paddingRight }}
      >
        {/* سمت چپ: علامت زیرمجموعه + آواتار + نام + ID */}
        <div className="flex items-center gap-1">
          {indentLevel > 0 && (
            <div
              className={`w-2 h-2 rounded-full ${
                indentLevel === 1 ? "bg-sky-400" : "bg-pink-400"
              }`}
            />
          )}
          <div
            className="w-[26px] h-[26px] rounded-2xl bg-[#0b1120] flex items-center justify-center text-sm font-bold text-white cursor-pointer"
            onClick={(e) => {
              // In tree mode, parent rows with children are used for expand/collapse.
              // Make the avatar area always navigate to the user.
              e.preventDefault();
              e.stopPropagation();
              navigateToUser();
            }}
            title="مشاهده پروفایل"
          >
            {u.displayName?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold">
              {renderUserTitle()}
            </span>
          </div>
        </div>

        {/* سمت راست: موجودی و (برای ایجنت/سوپر) تعداد کاربران زیرمجموعه */}
        <div className="flex flex-col items-end gap-0.5">
          <div className="text-sm font-mono text-yellow-300">
            {u.tomanBalance.toLocaleString("en-US")}
          </div>
          {(u.role === "agent" || u.role === "super") && (
            <span className="text-[11px] text-gray-300">
              {`کاربر زیرمجموعه: ${(u as ManagedUserSummary).managedUserCount?.toLocaleString("en-US") ?? "0"}`}
            </span>
          )}
        </div>
      </button>
    );
  };

  const UserTreeNodeComponent: React.FC<{ node: UserTreeNode; level: number }> = ({
    node,
    level,
  }) => {
    const [expanded, setExpanded] = useState(false);
    const hasChildren = node.children.length > 0;

    return (
      <div>
        <div className="flex items-center gap-2">
          {hasChildren && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="w-6 h-6 flex items-center justify-center text-xs text-gray-300"
            >
              {expanded ? "▾" : "▸"}
            </button>
          )}
          <div className="flex-1">
            {renderUserRow(node, level, {
              // اگر نود فرزند دارد، کلیک روی کل ردیف فقط expand/collapse کند و وارد صفحه کاربر نشود
              onClickOverride: hasChildren
                ? () => setExpanded((prev) => !prev)
                : undefined,
              disableNavigate: hasChildren,
            })}
          </div>
        </div>
        {expanded && hasChildren && (
          <div className="mt-1 space-y-1">
            {node.children.map((child) => (
              <UserTreeNodeComponent key={child.id} node={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0E0E0F] text-white p-4">
      <div className="max-w-md mx-auto">
        {/* حالت نمایش: عادی / درخت کاربران */}
        <div className="mb-4 flex rounded-2xl overflow-hidden bg-[#111827] text-sm font-semibold">
          <button
            className={`flex-1 py-2 ${
              viewMode === "flat" ? "bg-teal-500 text-black" : "text-gray-300"
            }`}
            onClick={() => setViewMode("flat")}
          >
            عادی
          </button>
          <button
            className={`flex-1 py-2 ${
              viewMode === "tree" ? "bg-teal-500 text-black" : "text-gray-300"
            }`}
            onClick={() => setViewMode("tree")}
          >
            درخت کاربران
          </button>
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

        {/* Tabs + total count */}
        {currentRole !== "agent" && (
          <div className="flex items-center justify-between mb-3">
            <div className="flex flex-1 rounded-2xl bg-[#111827] overflow-hidden text-sm font-semibold">
              {roleTabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setRoleFilter(tab.key)}
                  className={`flex-1 py-2 ${
                    roleFilter === tab.key
                      ? "bg-teal-500 text-black"
                      : "text-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="ml-3 text-sm text-gray-300">
              <span>{totalCount}</span>
            </div>
          </div>
        )}
        {currentRole === "agent" && (
          <div className="flex items-center justify-end mb-3">
            <div className="text-sm text-gray-300">
              <span>تعداد کاربر: {totalCount}</span>
            </div>
          </div>
        )}

        {/* لیست کاربران */}
        <div className="space-y-2 mt-2">
          {loading ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              در حال بارگذاری...
            </div>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              کاربری برای نمایش وجود ندارد
            </div>
          ) : viewMode === "flat" ? (
            users.map((u) => renderUserRow(u))
          ) : (
            treeRoots.map((node) => (
              <UserTreeNodeComponent key={node.id} node={node} level={0} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}


