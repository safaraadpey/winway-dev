"use client";

import React, { useEffect } from 'react';
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";

export default function SupportPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();

  // فعال کردن دکمه back در header
  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick]);

  return (
    <div className="min-h-screen bg-[#0E0E0F] bg-cover bg-center bg-no-repeat flex items-center justify-center">
      <div className="text-white text-center">
        <h1 className="text-3xl font-bold mb-4">پشتیبانی</h1>
        <p className="text-lg">صفحه پشتیبانی</p>
      </div>
    </div>
  );
}

