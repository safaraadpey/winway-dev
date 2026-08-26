"use client";

import React from "react";
import MainMenuScreen from "@/src/screens/MainMenuScreen";
import { useAutoStartTour } from "@/lib/hooks/useAutoStartTour";
import { MAIN_PAGE_TOUR_ID } from "@/lib/tour/configs/mainPageTour";
import { useEntryBannerGate } from "@/lib/entry-banner-gate";

export default function PlayerHomePage() {
  const { settled, blocking } = useEntryBannerGate();
  useAutoStartTour(MAIN_PAGE_TOUR_ID, settled && !blocking);

  return <MainMenuScreen />;
}
