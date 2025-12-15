"use client";

import React from 'react';

/**
 * Layout برای صفحات احراز هویت
 * بدون DingHeader و PlayerStatusBar
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}

