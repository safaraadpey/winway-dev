import { themeAssetPath } from "@/lib/theme/assetPaths";
import type { LogoImageKey, ThemeId } from "@/lib/theme/types";

export const LOGO_IMAGE_FILES: Record<LogoImageKey, string> = {
  logo: "logo.png",
  ingameLogo: "ingamelogo.png",
  playerHeaderLogo: "playerheaderlogo.png",
  ogPreview: "ding_money_preview.jpg",
  brand: "ding_money.jpg",
};

export function getLogoImagePath(themeId: ThemeId, key: LogoImageKey): string {
  return themeAssetPath(themeId, "logo", LOGO_IMAGE_FILES[key]);
}
