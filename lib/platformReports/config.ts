export type PlatformReportsSource = "legacy" | "platform" | "compare";

/**
 * Stage 1 cutover flag — admin platform-sessions report only.
 * Default: legacy (Bingo-equivalent projection from rooms/tickets).
 */
export function getPlatformReportsSource(): PlatformReportsSource {
  const raw = (process.env.PLATFORM_REPORTS_SOURCE || "legacy").trim().toLowerCase();
  if (raw === "platform" || raw === "compare" || raw === "legacy") {
    return raw;
  }
  console.warn(
    `[PlatformReports] invalid PLATFORM_REPORTS_SOURCE=${raw}; falling back to legacy`
  );
  return "legacy";
}

/**
 * Stage 2 cutover flag — history / analytics reads only.
 * Independent of PLATFORM_REPORTS_SOURCE so Stage 1 Production stays isolated.
 * Default: legacy (safe until Stage 2 validation + explicit switch).
 */
export function getPlatformHistorySource(): PlatformReportsSource {
  const raw = (process.env.PLATFORM_HISTORY_SOURCE || "legacy").trim().toLowerCase();
  if (raw === "platform" || raw === "compare" || raw === "legacy") {
    return raw;
  }
  console.warn(
    `[PlatformHistory] invalid PLATFORM_HISTORY_SOURCE=${raw}; falling back to legacy`
  );
  return "legacy";
}

/** Terminal / historical lifecycle statuses for Stage 2 history lists. */
export const HISTORY_DEFAULT_STATUSES = [
  "settled",
  "cancelled",
  "finished",
  "archived",
] as const;

/** Map platform lifecycle statuses → Bingo rooms.status values for legacy filters. */
export function platformStatusesToBingoRoomStatuses(statuses: string[]): string[] {
  const set = new Set<string>();
  for (const s of statuses) {
    switch (s) {
      case "cancelled":
        set.add("cancelled");
        break;
      case "archived":
        set.add("idle");
        break;
      case "settled":
        set.add("finished");
        break;
      case "finished":
        set.add("settling");
        break;
      case "running":
        set.add("playing");
        set.add("live");
        break;
      case "waiting":
      case "claimed":
        set.add("waiting");
        break;
      default:
        break;
    }
  }
  return Array.from(set);
}
