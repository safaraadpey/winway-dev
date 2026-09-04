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
  /** لایو روم: هدر و صفحه با هم اسکرول شوند، نه فقط کارت‌ها */
  fullPageScroll: boolean;
  setFullPageScroll: (enabled: boolean) => void;
  onBackClick?: (() => void) | null;
  setOnBackClick: (callback: (() => void) | null) => void;
  onRefreshClick?: (() => void | Promise<void>) | null;
  setOnRefreshClick: React.Dispatch<
    React.SetStateAction<(() => void | Promise<void>) | null>
  >;
}

const HeaderVisibilityContext = createContext<HeaderVisibilityContextType | undefined>(undefined);

export function HeaderVisibilityProvider({ children }: { children: ReactNode }) {
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [showBackButton, setShowBackButton] = useState<boolean>(false);
  const [showStatusBar, setShowStatusBar] = useState<boolean>(true);
  const [balanceRefreshDisabled, setBalanceRefreshDisabled] =
    useState<boolean>(false);
  const [fullPageScroll, setFullPageScroll] = useState<boolean>(false);
  const [onBackClick, setOnBackClick] = useState<(() => void) | null>(null);
  const [onRefreshClick, setOnRefreshClick] = useState<
    (() => void | Promise<void>) | null
  >(null);

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
      fullPageScroll,
      setFullPageScroll,
      onBackClick,
      setOnBackClick,
      onRefreshClick,
      setOnRefreshClick
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

