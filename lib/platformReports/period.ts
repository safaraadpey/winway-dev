export function getPeriodRange(period: string): { from: Date; to: Date } {
  const now = new Date();
  if (period === "day") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from, to: now };
  }
  if (period === "week") {
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const from = new Date(now.getFullYear(), now.getMonth(), diff);
    return { from, to: now };
  }
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: now };
}

export function parsePeriodParams(searchParams: URLSearchParams): {
  from: Date;
  to: Date;
} | { error: string } {
  const period = (searchParams.get("period") || "month").toLowerCase();

  if (period === "range") {
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");
    if (!fromStr || !toStr) {
      return { error: "برای بازه، تاریخ از/تا الزامی است." };
    }
    const from = new Date(`${fromStr}T00:00:00.000`);
    const to = new Date(`${toStr}T23:59:59.999`);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to) {
      return { error: "بازه تاریخ نامعتبر است." };
    }
    return { from, to };
  }

  if (period === "day" || period === "week" || period === "month") {
    return getPeriodRange(period);
  }

  return { error: "period نامعتبر است." };
}

export function parseStatusList(
  raw: string | null,
  fallback: readonly string[]
): string[] {
  if (!raw || !raw.trim()) return [...fallback];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
