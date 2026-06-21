import { themeAssetPath } from "@/lib/theme/assetPaths";
import type { ThemeId } from "@/lib/theme/types";

export type ActiveGameIconKey = "play" | "waiting";

export const ACTIVE_GAME_ICON_FILES: Record<ActiveGameIconKey, string> = {
  play: "play.png",
  waiting: "hourglass.png",
};

/** Status icons for MyActiveGames chips (`public/themes/{id}/icons/`). */
export function getActiveGameIconPath(
  themeId: ThemeId,
  key: ActiveGameIconKey
): string {
  return themeAssetPath(themeId, "icons", ACTIVE_GAME_ICON_FILES[key]);
}
