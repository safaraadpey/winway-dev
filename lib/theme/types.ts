import type { StaticImageData } from "next/image";

export type ThemeId = "dark" | "light";

/** @deprecated Use ThemeId */
export type AppTheme = ThemeId;

export const THEME_STORAGE_KEY = "dingmoney-app-theme";

export const DEFAULT_THEME: ThemeId = "dark";

export type MenuItemId =
  | "gameRoom"
  | "tournaments"
  | "leaderboard"
  | "myProfile"
  | "settings"
  | "reports"
  | "logout"
  | "support";

export type MenuImageKey =
  | "gameRoom"
  | "tournaments"
  | "leaderboard"
  | "myProfile"
  | "settings"
  | "reports"
  | "logout"
  | "support";

export type MenuItemPresentation =
  | { kind: "image"; imageKey: MenuImageKey; alt: string }
  | { kind: "styled"; titleFa: string; titleEn?: string };

export interface MenuTokens {
  screenOverlay: string;
  itemBackground: string;
  itemBackgroundImage: string;
  itemBackgroundGradient: string;
  itemBorder: string;
  itemOverlay: string;
  itemText: string;
  itemRadius: string;
}

export interface PlayerTokens {
  textPrimary: string;
  textMuted: string;
  pageOverlay: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  accent: string;
  accentMuted: string;
  layoutBg: string;
  layoutBgImage: string;
}

export interface ThemeTokens {
  player: PlayerTokens;
  menu: MenuTokens;
}

export interface MenuEntryDefinition {
  id: MenuItemId;
  label: string;
  href?: string;
  action?: "logout";
  halfWidth?: boolean;
}

export interface ThemeDefinition {
  id: ThemeId;
  title: string;
  hint: string;
  tokens: ThemeTokens;
  menuItems: Record<MenuItemId, MenuItemPresentation>;
}

export interface ThemeOption {
  id: ThemeId;
  title: string;
  hint: string;
}

export type MenuImageMap = Record<MenuImageKey, StaticImageData>;
