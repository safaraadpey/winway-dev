import { darkTheme } from "@/lib/theme/definitions/dark";
import { lightTheme } from "@/lib/theme/definitions/light";
import type { ThemeDefinition, ThemeId, ThemeOption } from "@/lib/theme/types";
import { DEFAULT_THEME } from "@/lib/theme/types";

const THEME_REGISTRY: Record<ThemeId, ThemeDefinition> = {
  dark: darkTheme,
  light: lightTheme,
};

export const THEME_IDS = Object.keys(THEME_REGISTRY) as ThemeId[];

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return value != null && value in THEME_REGISTRY;
}

export function getThemeDefinition(themeId: ThemeId): ThemeDefinition {
  return THEME_REGISTRY[themeId];
}

export function resolveThemeId(stored: string | null | undefined): ThemeId {
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

export function getThemeOptions(): ThemeOption[] {
  return THEME_IDS.map((id) => {
    const definition = THEME_REGISTRY[id];
    return {
      id: definition.id,
      title: definition.title,
      hint: definition.hint,
    };
  });
}
