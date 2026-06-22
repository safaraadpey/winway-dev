"use client";

import React from "react";
import panelStyles from "@/components/room/gameRoomPanels.module.css";

interface ActiveCardRowProps {
  title: string;
  count: number;
}

export default function ActiveCardRow({ title, count }: ActiveCardRowProps) {
  return (
    <div className={panelStyles.activeCardRow}>
      <span className={panelStyles.activeCardRowTitle}>{title}</span>
      <span className={panelStyles.activeCardRowCount}>{count} برگ</span>
    </div>
  );
}
