export type GatewayDepositRow = {
  amount?: unknown;
  created_at?: string;
  idempotency_key?: string | null;
};

/** Fiat gateway deposits exclude crypto (`deposit:tron:`) rows. */
export function isGatewayDeposit(idempotencyKey: string | null | undefined): boolean {
  const key = String(idempotencyKey ?? "");
  return !key.startsWith("deposit:tron:");
}

export function sumGatewayPurchasesSince(
  rows: GatewayDepositRow[],
  startIso: string
): number {
  return rows.reduce((sum, row) => {
    const createdAt = String(row.created_at ?? "");
    if (!createdAt || createdAt < startIso) return sum;
    if (!isGatewayDeposit(row.idempotency_key)) return sum;
    return sum + Number(row.amount || 0);
  }, 0);
}

export function sumGatewayPurchasesInRange(
  rows: GatewayDepositRow[],
  fromIso: string,
  toIso: string
): number {
  return rows.reduce((sum, row) => {
    const createdAt = String(row.created_at ?? "");
    if (!createdAt || createdAt < fromIso || createdAt > toIso) return sum;
    if (!isGatewayDeposit(row.idempotency_key)) return sum;
    return sum + Number(row.amount || 0);
  }, 0);
}
