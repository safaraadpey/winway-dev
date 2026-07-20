"use client";

import React from "react";
import MainMenuScreen from "@/src/screens/MainMenuScreen";
import { useAutoStartTour } from "@/lib/hooks/useAutoStartTour";
import { MAIN_PAGE_TOUR_ID } from "@/lib/tour/configs/mainPageTour";

export default function PlayerHomePage() {
  useAutoStartTour(MAIN_PAGE_TOUR_ID, true);

  return <MainMenuScreen />;
}
