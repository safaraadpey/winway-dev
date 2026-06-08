"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface HeaderVisibilityContextType {
  showHeader: boolean;
  setShowHeader: (show: boolean) => void;
  showBackButton: boolean;
  setShowBackButton: (show: boolean) => void;
  showStatusBar: boolean;
  setShowStatusBar: (show: boolean) => void;
  /** غیرفعال کردن refresh دستی ding/toman در هدر (مثلاً حین بازی زنده) */
  balanceRefreshDisabled: boolean;
  setBalanceRefreshDisabled: (disabled: boolean) => void;
  onBackClick?: (() => void) | null;
  setOnBackClick: (callback: (() => void) | null) => void;
}

const HeaderVisibilityContext = createContext<HeaderVisibilityContextType | undefined>(undefined);

export function HeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showBackButton, setShowBackButton] = useState<boolean>(false);
  const [showStatusBar, setShowStatusBar] = useState<boolean>(true);
  const [balanceRefreshDisabled, setBalanceRefreshDisabled] =
    useState<boolean>(false);
  const [onBackClick, setOnBackClick] = useState<(() => void) | null>(null);

  return (
    <HeaderVisibilityContext.Provider value={{ 
      showHeader, 
      setShowHeader,
      showBackButton,
      setShowBackButton,
      showStatusBar,
      setShowStatusBar,
      balanceRefreshDisabled,
      setBalanceRefreshDisabled,
      onBackClick,
      setOnBackClick
    }}>
      {children}
    </HeaderVisibilityContext.Provider>
  );
}

export function useHeaderVisibility() {
  const context = useContext(HeaderVisibilityContext);
  if (context === undefined) {
    throw new Error('useHeaderVisibility must be used within a HeaderVisibilityProvider');
  }
  return context;
}

