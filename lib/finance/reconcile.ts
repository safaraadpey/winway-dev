import { createServiceClient } from "@/lib/supabaseServer";
import {
  financeMetricInc,
  financeMetricSet,
} from "@/lib/finance/metrics";

export type ReconRunResult = {
  report_id: number;
  status: "ok" | "drift" | "error";
  wallet_ledger: {
    ok: boolean;
    checked: number;
    drift_count: number;
    drifts: unknown[];
  };
  money_conservation: {
    ok: boolean;
    transfers?: { ok: boolean; net: number };
    treasury_injection?: unknown;
    game_cycle?: unknown;
    liability?: unknown;
  };
};

/**
 * Runs wallet↔ledger + money conservation recon.
 * Reports only — never auto-repairs balances.
 */
export async function runFinanceReconciliation(): Promise<ReconRunResult> {
  const supabase = createServiceClient();
  console.log("[Wallet] finance recon start");

  const { data, error } = await supabase.rpc("fn_recon_run_and_store");

  if (error) {
    console.error("[Wallet] finance recon rpc error:", error.message);
    financeMetricInc("failed_reconciliation");
    throw new Error(error.message);
  }

  const result = data as unknown as ReconRunResult;
  const driftCount = Number(result?.wallet_ledger?.drift_count ?? 0);
  financeMetricSet("wallet_drift", driftCount);
  financeMetricSet("ledger_drift", driftCount);

  if (result?.status !== "ok") {
    financeMetricInc("failed_reconciliation");
    console.error("[Wallet] finance recon DRIFT", {
      reportId: result?.report_id,
      driftCount,
      conservationOk: result?.money_conservation?.ok,
    });
  } else {
    console.log("[Wallet] finance recon ok", { reportId: result?.report_id });
  }

  return result;
}
