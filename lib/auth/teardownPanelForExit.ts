import { clearAdminPermissionsCache } from "@/lib/admin-permissions";
import { clearDashboardCache } from "@/services/dashboard";
import { clearGamesReportCache } from "@/services/games-report";
import { clearTournamentReportCache } from "@/services/tournaments-report";
import { clearTransactionHistoryCache } from "@/services/transactions";
import { clearUserAccountDataCache } from "@/services/user-account";
import { clearManagedUsersCache } from "@/services/users";

export type PanelExitRole = "admin" | "agent";

/**
 * Tear down in-memory admin/agent panel caches and operational state during hard exit.
 */
export function teardownPanelForExit(role: PanelExitRole): void {
  try {
    clearDashboardCache();
  } catch {
    // ignore
  }

  if (role === "admin") {
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
