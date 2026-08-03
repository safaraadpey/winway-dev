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
