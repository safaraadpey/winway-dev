"use client";

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DingContextType {
  dingBalance: number;
  addDing: () => void;
  isAnimating: boolean;
}

const DingContext = createContext<DingContextType | undefined>(undefined);

interface DingProviderProps {
  children: ReactNode;
  initialBalance?: number;
}

export function DingProvider({ children, initialBalance = 1000 }: DingProviderProps) {
  const [dingBalance, setDingBalance] = useState(initialBalance);
  const [isAnimating, setIsAnimating] = useState(false);

  const addDing = () => {
    setIsAnimating(true);
    setDingBalance((prev) => prev + 10);
    
    // بعد از انیمیشن، flag را reset کن
    setTimeout(() => {
      setIsAnimating(false);
    }, 1000);
  };

  return (
    <DingContext.Provider value={{ dingBalance, addDing, isAnimating }}>
      {children}
    </DingContext.Provider>
  );
}

export function useDing() {
  const context = useContext(DingContext);
  if (context === undefined) {
    throw new Error('useDing must be used within a DingProvider');
  }
  return context;
}

