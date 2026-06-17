import { clearAdminPermissionsCache } from "@/lib/admin-permissions";
import { clearDashboardCache } from "@/services/dashboard";
import { clearGamesReportCache } from "@/services/games-report";
import { clearTournamentReportCache } from "@/services/tournaments-report";
import { clearTransactionHistoryCache } from "@/services/transactions";
import { clearUserAccountDataCache } from "@/services/user-account";
import { clearManagedUsersCache } from "@/services/users";

export type PanelExitRole = "admin" | "agent" | "dev-panel";

function clearsAdminScopedCaches(role: PanelExitRole): boolean {
  return role === "admin" || role === "dev-panel";
}

/**
 * Tear down in-memory admin/agent/dev-panel caches and operational state during hard exit.
 */
export function teardownPanelForExit(role: PanelExitRole): void {
  try {
    clearDashboardCache();
  } catch {
    // ignore
  }

  if (clearsAdminScopedCaches(role)) {
    try {
      clearAdminPermissionsCache();
    } catch {
      // ignore
    }
  }

  try {
    clearManagedUsersCache();
  } catch {
    // ignore
  }

  try {
    clearTournamentReportCache();
  } catch {
    // ignore
  }

  try {
    clearGamesReportCache();
  } catch {
    // ignore
  }

  try {
    clearUserAccountDataCache();
  } catch {
    // ignore
  }

  try {
    clearTransactionHistoryCache();
  } catch {
    // ignore
  }
}
