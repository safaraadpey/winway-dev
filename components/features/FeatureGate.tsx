"use client";

import React from "react";
import { useFeatures } from "@/lib/featureFlags/useFeatures";

type FeatureGateProps = {
  featureKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export default function FeatureGate({
  featureKey,
  children,
  fallback = null,
}: FeatureGateProps) {
  const { hasFeature, loading } = useFeatures();

  if (loading) {
    return null;
  }

  if (!hasFeature(featureKey)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
