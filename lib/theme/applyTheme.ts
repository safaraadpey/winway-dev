import type { ThemeId, ThemeTokens } from "@/lib/theme/types";
import { getThemeDefinition } from "@/lib/theme/registry";

function tokensToCssProperties(tokens: ThemeTokens): Record<string, string> {
  const { player, menu } = tokens;
  return {
    "--player-text-primary": player.textPrimary,
    "--player-text-muted": player.textMuted,
    "--player-page-overlay": player.pageOverlay,
    "--player-surface": player.surface,
    "--player-surface-elevated": player.surfaceElevated,
    "--player-border": player.border,
    "--player-accent": player.accent,
    "--player-accent-muted": player.accentMuted,
    "--player-layout-bg": player.layoutBg,
    "--player-layout-bg-image": player.layoutBgImage,
    "--player-header-bg": player.headerBg,
    "--player-header-frame-image": player.headerFrameImage,
    "--player-header-frame-blend-mode": player.headerFrameBlendMode,
    "--player-header-frame-filter": player.headerFrameFilter,
    "--player-ding-balance-bg-image": player.dingBalanceBgImage,
    "--player-toman-balance-bg-image": player.tomanBalanceBgImage,
    "--player-active-game-chip-bg-image": player.activeGameChipBgImage,
    "--player-active-game-chip-radius": player.activeGameChipRadius,
    "--player-buy-cards-panel-bg-image": player.buyCardsPanelBgImage,
    "--player-buy-cards-panel-bg-color": player.buyCardsPanelBgColor,
    "--player-active-cards-panel-bg-image": player.activeCardsPanelBgImage,
    "--player-active-cards-panel-bg-color": player.activeCardsPanelBgColor,
    "--menu-screen-overlay": menu.screenOverlay,
    "--menu-item-bg": menu.itemBackground,
    "--menu-item-bg-image": menu.itemBackgroundImage,
    "--menu-item-bg-gradient": menu.itemBackgroundGradient,
    "--menu-item-border": menu.itemBorder,
    "--menu-item-overlay": menu.itemOverlay,
    "--menu-item-text": menu.itemText,
    "--menu-item-radius": menu.itemRadius,
  };
}

export function applyThemeTokens(themeId: ThemeId): void {
  const definition = getThemeDefinition(themeId);
  const root = document.documentElement;

  root.dataset.theme = themeId;

  const properties = tokensToCssProperties(definition.tokens);
  for (const [name, value] of Object.entries(properties)) {
    root.style.setProperty(name, value);
  }
}
