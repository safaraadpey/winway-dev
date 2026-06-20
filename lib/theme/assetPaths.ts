import type { ThemeId } from "@/lib/theme/types";

export type ThemeAssetCategory = "backgrounds" | "menu" | "icons" | "logo" | "assets";

export function themeAssetPath(
  themeId: ThemeId,
  category: ThemeAssetCategory,
  filename: string
): string {
  return `/themes/${themeId}/${category}/${filename}`;
}

export function themeLayoutBgImage(themeId: ThemeId): string {
  if (themeId === "light") return "none";
  return `url(${themeAssetPath("dark", "backgrounds", "layout_BG.webp")})`;
}

/** Header frame art per theme (`public/themes/{id}/assets/headerframe.png`). */
export function themeHeaderFrameImage(themeId: ThemeId): string {
  return `url(${themeAssetPath(themeId, "assets", "headerframe.png")})`;
}
