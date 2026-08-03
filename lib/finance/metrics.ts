/**
 * In-process finance integrity metrics (P6.4).
 * Exposed via /api/admin/finance/metrics — not a durable TSDB.
 */
const counters = {
  wallet_drift: 0,
  ledger_drift: 0,
  duplicate_transfer_attempts: 0,
  duplicate_apply_delta_attempts: 0,
  failed_reconciliation: 0,
  partial_bulk_failure: 0,
};

export type FinanceMetricName = keyof typeof counters;

export type FinanceMetricsSnapshot = {
  [K in FinanceMetricName]: number;
} & { updatedAt: string };

export function financeMetricInc(name: FinanceMetricName, by = 1): void {
  counters[name] = (counters[name] || 0) + by;
}

export function financeMetricsSnapshot(): FinanceMetricsSnapshot {
  return { ...counters, updatedAt: new Date().toISOString() };
}

export function financeMetricSet(
  name: "wallet_drift" | "ledger_drift",
  value: number
): void {
  counters[name] = value;
}
