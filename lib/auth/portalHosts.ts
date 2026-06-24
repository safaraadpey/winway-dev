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
