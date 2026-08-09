/**
 * Client-safe flag for synthetic deposit identity UI (Buy Rial).
 * Must match server DEPOSIT_SYNTHETIC_CUSTOMER_IDENTITY when enabled.
 */
export function isSyntheticCustomerIdentityUiEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_DEPOSIT_SYNTHETIC_CUSTOMER_IDENTITY;
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}
