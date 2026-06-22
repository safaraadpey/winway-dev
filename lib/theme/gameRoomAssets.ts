import { themeAssetPath } from "@/lib/theme/assetPaths";
import type { ThemeId } from "@/lib/theme/types";

export const GAME_ROOM_ASSET_FILES = {
  buyCardsPanelBg: "TicktBuy_BG.png",
  activeCardsPanelBg: "ActiveCardsBG.png",
} as const;

export type GameRoomAssetKey = keyof typeof GAME_ROOM_ASSET_FILES;

export function getGameRoomAssetPath(
  themeId: ThemeId,
  key: GameRoomAssetKey
): string {
  return themeAssetPath(themeId, "assets", GAME_ROOM_ASSET_FILES[key]);
}

/** Buy-cards panel background (`public/themes/{id}/assets/TicktBuy_BG.png`). */
export function themeBuyCardsPanelBgImage(themeId: ThemeId): string {
  return `url(${getGameRoomAssetPath(themeId, "buyCardsPanelBg")})`;
}

/** Active cards / tables panel background (`public/themes/{id}/assets/ActiveCardsBG.png`). */
export function themeActiveCardsPanelBgImage(themeId: ThemeId): string {
  return `url(${getGameRoomAssetPath(themeId, "activeCardsPanelBg")})`;
}
