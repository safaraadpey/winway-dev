/**
 * Strict env flag parsing for deposit/HamiPay gates.
 * Avoids Boolean("false") === true mistakes.
 */

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

/**
 * Parse an explicit boolean env value.
 * - true only for: true | 1 | yes | on (case-insensitive, trimmed)
 * - false only for: false | 0 | no | off | empty | unset
 * - unknown non-empty strings → false (fail closed)
 */
export function parseEnvFlag(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  if (!v) return false;
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  return false;
}

/** True when raw is an explicit false-ish value (not merely unset). */
export function isEnvExplicitlyFalse(raw: string | undefined | null): boolean {
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return FALSE_VALUES.has(v);
}

export function hasNonEmptyEnv(raw: string | undefined | null): boolean {
  return Boolean(raw && String(raw).trim());
}

export function getDepositEnvDiagnostics(): {
  depositDomainEnabled: boolean;
  hamipayMock: boolean;
  hasHamiPayApiKey: boolean;
  hasHamiPayApiBaseUrl: boolean;
  hasHamiPayReturnBaseUrl: boolean;
  depositEnvironment: string;
  detectedDeploymentEnvironment: string;
  nodeEnv: string;
  vercelEnv: string;
  createAllowed: boolean;
  createAllowReason: string;
} {
  const depositDomainEnabled = parseEnvFlag(process.env.DEPOSIT_DOMAIN_ENABLED);
  const hamipayMock = parseEnvFlag(process.env.HAMIPAY_MOCK);
  const hasHamiPayApiKey = hasNonEmptyEnv(process.env.HAMIPAY_API_KEY);
  const hasHamiPayApiBaseUrl = hasNonEmptyEnv(process.env.HAMIPAY_API_BASE_URL);
  const hasHamiPayReturnBaseUrl = hasNonEmptyEnv(
    process.env.HAMIPAY_RETURN_BASE_URL
  );
  const depositEnvironment = (
    process.env.DEPOSIT_ENVIRONMENT || ""
  ).trim() || "(unset)";
  const vercelEnv = (process.env.VERCEL_ENV || "").trim() || "(unset)";
  const nodeEnv = (process.env.NODE_ENV || "").trim() || "(unset)";

  let detectedDeploymentEnvironment = "unknown";
  if (vercelEnv === "production") detectedDeploymentEnvironment = "vercel-production";
  else if (vercelEnv === "preview") detectedDeploymentEnvironment = "vercel-preview";
  else if (vercelEnv === "development") detectedDeploymentEnvironment = "vercel-development";
  else if (nodeEnv === "development") detectedDeploymentEnvironment = "local-development";
  else if (nodeEnv === "production") detectedDeploymentEnvironment = "node-production";

  const gate = resolveDepositCreateAllowed();

  return {
    depositDomainEnabled,
    hamipayMock,
    hasHamiPayApiKey,
    hasHamiPayApiBaseUrl,
    hasHamiPayReturnBaseUrl,
    depositEnvironment,
    detectedDeploymentEnvironment,
    nodeEnv,
    vercelEnv,
    createAllowed: gate.allowed,
    createAllowReason: gate.reason,
  };
}

/**
 * Gate for player deposit create/verify HTTP ingress.
 *
 * Allowed when:
 * 1) DEPOSIT_DOMAIN_ENABLED is explicitly true, OR
 * 2) HAMIPAY_MOCK is explicitly true (non-production NODE_ENV), OR
 * 3) Live HamiPay credentials are present (API key + base URL)
 *    AND DEPOSIT_DOMAIN_ENABLED is not explicitly false
 */
export function resolveDepositCreateAllowed(): {
  allowed: boolean;
  reason: string;
} {
  const domainEnabled = parseEnvFlag(process.env.DEPOSIT_DOMAIN_ENABLED);
  const domainExplicitFalse = isEnvExplicitlyFalse(
    process.env.DEPOSIT_DOMAIN_ENABLED
  );
  const mock = parseEnvFlag(process.env.HAMIPAY_MOCK);
  const hasLiveConfig =
    hasNonEmptyEnv(process.env.HAMIPAY_API_KEY) &&
    hasNonEmptyEnv(process.env.HAMIPAY_API_BASE_URL);

  if (domainEnabled) {
    return { allowed: true, reason: "DEPOSIT_DOMAIN_ENABLED" };
  }
  if (mock && process.env.NODE_ENV !== "production") {
    return { allowed: true, reason: "HAMIPAY_MOCK" };
  }
  if (hasLiveConfig && !domainExplicitFalse) {
    return { allowed: true, reason: "HAMIPAY_LIVE_CONFIG" };
  }
  if (domainExplicitFalse) {
    return {
      allowed: false,
      reason: "DEPOSIT_DOMAIN_ENABLED_EXPLICIT_FALSE",
    };
  }
  return {
    allowed: false,
    reason: "DEPOSIT_DOMAIN_DISABLED_AND_NO_HAMIPAY_CONFIG",
  };
}
