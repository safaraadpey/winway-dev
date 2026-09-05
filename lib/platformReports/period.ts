import {
  getOpenTehranAccountingWindow,
  getOpenTehranWeekAccountingWindow,
} from "@/lib/dashboard/tehranAccountingWindow";

export function getPeriodRange(period: string): { from: Date; to: Date } {
  if (period === "day") {
    const { fromIso, toIso } = getOpenTehranAccountingWindow();
    return { from: new Date(fromIso), to: new Date(toIso) };
  }
  if (period === "week") {
    const { fromIso, toIso } = getOpenTehranWeekAccountingWindow();
    return { from: new Date(fromIso), to: new Date(toIso) };
  }
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from, to: now };
}

export function parsePeriodParams(
  searchParams: URLSearchParams,
  defaultPeriod = "month"
): {
  from: Date;
  to: Date;
} | { error: string } {
  const period = (searchParams.get("period") || defaultPeriod).toLowerCase();

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
