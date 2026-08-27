import { isWithinPlayWindow } from "./isWithinPlayWindow.js";
import type {
  DevPlayerConfigSnapshot,
  DevPlayerSettingsSnapshot,
  RoomTemplateSnapshot,
} from "./types.js";

function priceMatchesAllowed(templatePrice: number, allowedPrices: number[]): boolean {
  return allowedPrices.some((allowedPrice) => Number(allowedPrice) === Number(templatePrice));
}

function isProfileInPlayWindow(
  profile: DevPlayerConfigSnapshot["profiles"][number],
  now: Date,
  timezone: string
): boolean {
  return isWithinPlayWindow(profile.playWindows, now, timezone);
}

export function isPlayerEligibleForTemplate(
  player: DevPlayerConfigSnapshot,
  template: RoomTemplateSnapshot,
  settings: DevPlayerSettingsSnapshot,
  now: Date
): { ok: true } | { ok: false; reason: "outsidePlayerWindow" | "priceRange" } {
  if (player.profiles.length === 0) {
    return { ok: false, reason: "outsidePlayerWindow" };
  }

  for (const profile of player.profiles) {
    if (
      isProfileInPlayWindow(profile, now, settings.timezone) &&
      priceMatchesAllowed(template.price, profile.allowedPrices)
    ) {
      return { ok: true };
    }
  }

  const hasWindowMatch = player.profiles.some((profile) =>
    isProfileInPlayWindow(profile, now, settings.timezone)
  );

  if (!hasWindowMatch) {
    return { ok: false, reason: "outsidePlayerWindow" };
  }

  return { ok: false, reason: "priceRange" };
}
