import { themeAssetPath } from "@/lib/theme/assetPaths";
import type { ThemeId } from "@/lib/theme/types";

export const BACK_ICON_FILE = "back.png";

/** Back button icon in MergedPlayerHeader (`public/themes/{id}/icons/`). */
export function getBackIconPath(themeId: ThemeId): string {
  return themeAssetPath(themeId, "icons", BACK_ICON_FILE);
}
