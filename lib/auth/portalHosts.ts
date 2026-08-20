const DEFAULT_MAIN_HOST = "dingmoney.org";
const DEFAULT_MAIN_ORIGIN = "https://dingmoney.org";
const DEFAULT_ADMIN_HOST = "admin.dingmoney.org";
const DEFAULT_ADMIN_ORIGIN = "https://admin.dingmoney.org";

export function getMainHost(): string {
  return (process.env.NEXT_PUBLIC_MAIN_HOST || DEFAULT_MAIN_HOST).toLowerCase();
}

export function getAdminHost(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_HOST || DEFAULT_ADMIN_HOST).toLowerCase();
}

export function getAdminOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_ADMIN_ORIGIN;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }
  return DEFAULT_ADMIN_ORIGIN;
}

export function getMainOrigin(): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_MAIN_ORIGIN;
  if (configuredOrigin) {
    return configuredOrigin.replace(/\/+$/, "");
  }
  return DEFAULT_MAIN_ORIGIN;
}

/**
 * Canonical public origin for share links and referral page metadata.
 * Production serves www; bare apex redirects (307) to www.
 */
export function getMainPublicOrigin(): string {
  const configuredPublicOrigin = process.env.NEXT_PUBLIC_MAIN_PUBLIC_ORIGIN;
  if (configuredPublicOrigin) {
    return configuredPublicOrigin.replace(/\/+$/, "");
  }

  const mainOrigin = getMainOrigin();
  try {
    const url = new URL(mainOrigin);
    const mainHost = getMainHost();
    if (url.hostname === mainHost) {
      return `https://www.${mainHost}`;
    }
    return mainOrigin;
  } catch {
    return `https://www.${getMainHost()}`;
  }
}

export function isMainHost(hostname: string): boolean {
  const mainHost = getMainHost();
  const normalized = hostname.toLowerCase();
  return normalized === mainHost || normalized === `www.${mainHost}`;
}

export function isAdminHost(hostname: string): boolean {
  return hostname.toLowerCase() === getAdminHost();
}

export function isNonPlayerRole(role: string | undefined | null): boolean {
  return !!role && role !== "player";
}
