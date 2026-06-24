import { callDevPanelApi } from "@/lib/devPanelApiClient";
import type {
  DevPlayerFinancePeriod,
  DevPlayerFinanceReportResult,
} from "@/src/types/dev-player-finance";

export async function loadDevPlayerFinanceReport(): Promise<DevPlayerFinanceReportResult> {
  return callDevPanelApi<DevPlayerFinanceReportResult>("/api/dev-panel/dev-player-finance");
}

export async function loadDevPlayerFinancePeriod(
  period: DevPlayerFinancePeriod
): Promise<DevPlayerFinanceReportResult> {
  return callDevPanelApi<DevPlayerFinanceReportResult>(
    `/api/dev-panel/dev-player-finance?period=${period}`
  );
}
