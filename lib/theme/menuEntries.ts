import type { MenuEntryDefinition } from "@/lib/theme/types";

/** Static menu structure (order, routes, actions). Presentation comes from theme definition. */
export const MENU_ENTRIES: MenuEntryDefinition[] = [
  { id: "gameRoom", label: "Game Room", href: "/player/lobby" },
  { id: "tournaments", label: "Tournaments", href: "/player/tournaments" },
  { id: "leaderboard", label: "Leaderboard", href: "/player/leaderboard" },
  { id: "myProfile", label: "My Profile", href: "/player/myprofile" },
  { id: "settings", label: "Settings", href: "/player/settings" },
  { id: "reports", label: "Financial Reports", href: "/player/reports" },
  { id: "logout", label: "Logout", action: "logout", halfWidth: true },
  { id: "support", label: "Support", href: "/player/support", halfWidth: true },
];
