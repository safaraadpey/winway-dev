import type { DevTournamentRegisterTournament } from "@/src/types/dev-tournament-register";

export function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatScheduleTime(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatTournamentStartAt(startAt: string | null): string {
  if (!startAt) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(startAt));
}

export function formatTournamentOptionLabel(tournament: DevTournamentRegisterTournament): string {
  return `${tournament.title} — شروع: ${formatTournamentStartAt(tournament.startAt)}`;
}

export function campaignStatusLabel(status: string): string {
  if (status === "active") return "فعال";
  if (status === "completed") return "تمام‌شده";
  if (status === "cancelled") return "لغو شده";
  return status;
}

export function campaignModeLabel(mode: string): string {
  return mode === "immediate" ? "ثبت فوری" : "زمان‌بندی";
}

export function campaignStatusClass(status: string): string {
  if (status === "active") return "bg-amber-900/40 text-amber-200";
  if (status === "completed") return "bg-emerald-900/40 text-emerald-200";
  if (status === "cancelled") return "bg-red-900/40 text-red-200";
  return "bg-gray-800 text-gray-300";
}
