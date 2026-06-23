export type ThemeId = "dark" | "light" | "newStyle";

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

export type LogoImageKey =
  | "logo"
  | "ingameLogo"
  | "playerHeaderLogo"
  | "ogPreview"
  | "brand";

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
  headerBg: string;
  headerFrameImage: string;
  headerFrameBlendMode: string;
  headerFrameFilter: string;
  dingBalanceBgImage: string;
  tomanBalanceBgImage: string;
  dingBalanceAmountColor: string;
  tomanBalanceAmountColor: string;
  activeGameChipBgImage: string;
  activeGameChipRadius: string;
  buyCardsPanelBgImage: string;
  buyCardsPanelBgColor: string;
  activeCardsPanelBgImage: string;
  activeCardsPanelBgColor: string;
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
