"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { applyThemeTokens } from "@/lib/theme/applyTheme";
import { getThemeDefinition, resolveThemeId } from "@/lib/theme/registry";
import type { ThemeDefinition, ThemeId } from "@/lib/theme/types";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme/types";

interface ThemeContextType {
  themeId: ThemeId;
  /** Alias for themeId (backward compatible) */
  theme: ThemeId;
  setThemeId: (themeId: ThemeId) => void;
  /** Alias for setThemeId (backward compatible) */
  setTheme: (themeId: ThemeId) => void;
  themeDefinition: ThemeDefinition;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readStoredThemeId(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return resolveThemeId(window.localStorage.getItem(THEME_STORAGE_KEY));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const stored = readStoredThemeId();
    setThemeIdState(stored);
    applyThemeTokens(stored);
  }, []);

  const setThemeId = useCallback((next: ThemeId) => {
    setThemeIdState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyThemeTokens(next);
  }, []);

  const themeDefinition = getThemeDefinition(themeId);

  return (
    <ThemeContext.Provider
      value={{
        themeId,
        theme: themeId,
        setThemeId,
        setTheme: setThemeId,
        themeDefinition,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

export function useThemeId(): ThemeId {
  const context = useContext(ThemeContext);
  return context?.themeId ?? DEFAULT_THEME;
}
