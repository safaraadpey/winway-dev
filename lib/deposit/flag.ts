/** Deposit Domain feature flags (P6.5). Default: disabled unless live HamiPay configured. */

import {
  getDepositEnvDiagnostics,
  parseEnvFlag,
  resolveDepositCreateAllowed,
} from "@/lib/deposit/env";

export function isDepositDomainEnabled(): boolean {
  return parseEnvFlag(process.env.DEPOSIT_DOMAIN_ENABLED);
}

/**
 * When true, HamiPay customerName/phone are stable synthetic per-user values
 * (no manual Buy Rial identity form). Default: false (manual entry).
 *
 * Also honors NEXT_PUBLIC_DEPOSIT_SYNTHETIC_CUSTOMER_IDENTITY so a client-only
 * deploy env cannot hide the Buy Rial form while the server still requires
 * manual full_name/phone (full_name_required).
 */
export function isDepositSyntheticCustomerIdentityEnabled(): boolean {
  return (
    parseEnvFlag(process.env.DEPOSIT_SYNTHETIC_CUSTOMER_IDENTITY) ||
    parseEnvFlag(process.env.NEXT_PUBLIC_DEPOSIT_SYNTHETIC_CUSTOMER_IDENTITY)
  );
}

/**
 * Explicit local/DEV harness mode. Required for fake ingress when domain flag is off.
 * Never enable in production ingress routes.
 */
export function isDepositDomainTestMode(): boolean {
  return (
    parseEnvFlag(process.env.DEPOSIT_DOMAIN_TEST_MODE) ||
    process.env.NODE_ENV === "test"
  );
}

/**
 * Whether player deposit create/verify HTTP routes may proceed.
 */
export function isDepositHttpIngressAllowed(): boolean {
  return resolveDepositCreateAllowed().allowed;
}

export function assertDepositIngressAllowed(opts?: {
  testHarness?: boolean;
}): void {
  if (isDepositHttpIngressAllowed()) return;
  if (opts?.testHarness && isDepositDomainTestMode()) return;
  throw new Error("deposit_domain_disabled");
}

export { getDepositEnvDiagnostics, resolveDepositCreateAllowed };
