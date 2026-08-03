/** Deposit Domain feature flags (P6.5). Default: disabled. */
export function isDepositDomainEnabled(): boolean {
  return process.env.DEPOSIT_DOMAIN_ENABLED === "true";
}

/**
 * Explicit local/DEV harness mode. Required for fake ingress when domain flag is off.
 * Never enable in production ingress routes.
 */
export function isDepositDomainTestMode(): boolean {
  return (
    process.env.DEPOSIT_DOMAIN_TEST_MODE === "true" ||
    process.env.NODE_ENV === "test"
  );
}

export function assertDepositIngressAllowed(opts?: {
  testHarness?: boolean;
}): void {
  if (isDepositDomainEnabled()) return;
  if (opts?.testHarness && isDepositDomainTestMode()) return;
  throw new Error("deposit_domain_disabled");
}
