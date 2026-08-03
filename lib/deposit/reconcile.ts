import type { Pool, PoolClient } from "pg";
import { runDepositReconciliation } from "@/lib/deposit/service";

/** Report-only deposit recon — never repairs. */
export async function reconcileDepositDomain(
  db: Pool | PoolClient
): Promise<Record<string, unknown>> {
  return runDepositReconciliation(db);
}
