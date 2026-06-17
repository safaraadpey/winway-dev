const STORAGE_PREFIX = "entry_banner_snooze_v1";
const CONFIRMED_PREFIX = "confirmed:";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}::${userId}`;
}

function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readSnoozeStore(userId: string): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSnoozeStore(userId: string, store: Record<string, string>): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(store));
  } catch {
    // ignore quota / private mode errors
  }
}

function confirmationMarker(updatedAt: string | null | undefined): string {
  return `${CONFIRMED_PREFIX}${updatedAt ?? ""}`;
}

function shouldShowBanner<T extends { id: string; updatedAt?: string | null }>(
  banner: T,
  store: Record<string, string>
): boolean {
  const value = store[banner.id];
  if (!value) return true;
  if (value === getLocalDateKey()) return false;
  if (value === confirmationMarker(banner.updatedAt)) return false;
  return true;
}

export function isEntryBannerSnoozedForToday(userId: string, bannerId: string): boolean {
  const store = readSnoozeStore(userId);
  return store[bannerId] === getLocalDateKey();
}

export function snoozeEntryBannerForToday(userId: string, bannerId: string): void {
  const store = readSnoozeStore(userId);
  store[bannerId] = getLocalDateKey();
  writeSnoozeStore(userId, store);
}

export function confirmEntryBanner(
  userId: string,
  bannerId: string,
  updatedAt: string | null | undefined
): void {
  const store = readSnoozeStore(userId);
  store[bannerId] = confirmationMarker(updatedAt);
  writeSnoozeStore(userId, store);
}

export function filterEntryBannersForToday<T extends { id: string; updatedAt?: string | null }>(
  userId: string | null | undefined,
  banners: T[]
): T[] {
  if (!userId) return banners;
  const store = readSnoozeStore(userId);
  return banners.filter((banner) => shouldShowBanner(banner, store));
}
