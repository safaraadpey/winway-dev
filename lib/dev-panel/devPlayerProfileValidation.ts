export const DEV_PLAYER_PROFILE_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DevPlayerPlayWindow = {
  start: string;
  end: string;
};

export function normalizeProfileTime(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!DEV_PLAYER_PROFILE_TIME_RE.test(text)) return null;
  return text;
}

export function normalizePlayWindows(raw: unknown): DevPlayerPlayWindow[] {
  if (!Array.isArray(raw)) return [];

  const windows: DevPlayerPlayWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const start = normalizeProfileTime((item as DevPlayerPlayWindow).start);
    const end = normalizeProfileTime((item as DevPlayerPlayWindow).end);
    if (!start || !end || start >= end) continue;
    windows.push({ start, end });
  }

  return windows;
}

export function mapProfilePlayWindowsFromRow(row: Record<string, unknown>): DevPlayerPlayWindow[] {
  const fromColumn = normalizePlayWindows(row.play_windows);
  if (fromColumn.length > 0) return fromColumn;

  const start = normalizeProfileTime(row.start_time);
  const end = normalizeProfileTime(row.end_time);
  if (start && end && start < end) {
    return [{ start, end }];
  }

  return [];
}

export function normalizeAllowedPrices(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;

  const prices: number[] = [];
  const seen = new Set<number>();

  for (const item of raw) {
    const num = Number(item);
    if (!Number.isFinite(num) || num < 0) continue;
    if (seen.has(num)) continue;
    seen.add(num);
    prices.push(num);
  }

  prices.sort((a, b) => a - b);
  return prices;
}

export function validateProfilePayload(body: {
  name?: unknown;
  play_windows?: unknown;
  start_time?: unknown;
  end_time?: unknown;
  allowed_prices?: unknown;
}):
  | {
      ok: true;
      name: string;
      playWindows: DevPlayerPlayWindow[];
      allowedPrices: number[];
    }
  | { ok: false; message: string } {
  const name = String(body?.name ?? "").trim();
  if (!name) {
    return { ok: false, message: "profile name is required" };
  }

  let playWindows = normalizePlayWindows(body?.play_windows);
  if (playWindows.length === 0) {
    const start = normalizeProfileTime(body?.start_time);
    const end = normalizeProfileTime(body?.end_time);
    if (start && end && start < end) {
      playWindows = [{ start, end }];
    }
  }

  if (playWindows.length === 0) {
    return { ok: false, message: "at least one valid play window is required" };
  }

  const allowedPrices = normalizeAllowedPrices(body?.allowed_prices);
  if (!allowedPrices || allowedPrices.length === 0) {
    return { ok: false, message: "at least one allowed price is required" };
  }

  return { ok: true, name, playWindows, allowedPrices };
}

export function normalizeMemberUserIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const userId = String(item ?? "").trim();
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    ids.push(userId);
  }

  return ids;
}

export function mapDevPlayerProfileRow(row: Record<string, unknown>, memberCount: number) {
  return {
    id: String(row.id),
    name: String(row.name || ""),
    playWindows: mapProfilePlayWindowsFromRow(row),
    allowedPrices: Array.isArray(row.allowed_prices)
      ? row.allowed_prices.map((price: unknown) => Number(price))
      : [],
    memberCount,
    engineEnabled: Boolean(row.engine_enabled),
    updatedAt: (row.updated_at as string | null | undefined) ?? null,
  };
}
