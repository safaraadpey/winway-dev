"use client";

import React, { useCallback, useEffect, useState } from "react";
import { TIC_TAC_TOE_OPEN_EVENT } from "@/lib/tic-tac-toe/constants";
import { useTicTacToeSettings } from "@/lib/tic-tac-toe/client";
import { usePlayerPopupContent } from "@/lib/player-popup-content";
import TicTacToeModal from "@/components/tic-tac-toe/TicTacToeModal";

export default function TicTacToeHost() {
  const { settings } = useTicTacToeSettings();
  const popupContent = usePlayerPopupContent("tic_tac_toe");
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    window.addEventListener(TIC_TAC_TOE_OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(TIC_TAC_TOE_OPEN_EVENT, handleOpen);
  }, [handleOpen]);

  if (!settings?.isEnabled) {
    return null;
  }

  return (
    <TicTacToeModal
      open={open}
      onClose={handleClose}
      popupContent={{
        blocks: popupContent.blocks,
        displayMode: popupContent.displayMode,
        durationMs: popupContent.durationMs,
        rotationGroup: popupContent.rotationGroup,
      }}
    />
  );
}
