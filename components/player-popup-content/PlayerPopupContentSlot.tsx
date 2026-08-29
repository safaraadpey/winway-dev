"use client";

import { useMemo } from "react";
import { useThemeId } from "@/lib/contexts/ThemeContext";
import { getActivePlayerPopupContentBlocks } from "@/lib/player-popup-content/normalize";
import type {
  PlayerPopupContentBlock,
  PlayerPopupContentFeed,
} from "@/lib/player-popup-content/types";
import { DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE } from "@/lib/player-popup-content/types";
import { getResultsDialogAssetPath } from "@/lib/theme/resultsDialogAssets";
import PlayerPopupContentBlockRenderer from "./blocks/PlayerPopupContentBlockRenderer";
import styles from "./PlayerPopupContentSlot.module.css";

export type PlayerPopupContentSlotProps = PlayerPopupContentFeed & {
  className?: string;
  /** Reserved for future carousel rotation index (no timer yet). */
  activeBlockIndex?: number;
};

function blockUsesWinnersFillerBackground(block: PlayerPopupContentBlock): boolean {
  return block.type === "winners" || block.type === "countdown";
}

export default function PlayerPopupContentSlot({
  blocks,
  displayMode = DEFAULT_PLAYER_POPUP_CONTENT_DISPLAY_MODE,
  durationMs,
  rotationGroup,
  className,
  activeBlockIndex = 0,
}: PlayerPopupContentSlotProps) {
  const themeId = useThemeId();
  const winnersFillerBg = getResultsDialogAssetPath(themeId, "winnersSectionBg");

  const activeBlocks = useMemo(
    () => getActivePlayerPopupContentBlocks(blocks),
    [blocks]
  );

  if (activeBlocks.length === 0) {
    return null;
  }

  const visibleBlocks =
    displayMode === "carousel"
      ? activeBlocks.slice(activeBlockIndex, activeBlockIndex + 1)
      : activeBlocks;

  return (
    <section
      className={[styles.slot, className].filter(Boolean).join(" ")}
      data-display-mode={displayMode}
      data-block-count={activeBlocks.length}
      data-duration-ms={durationMs ?? undefined}
      data-rotation-group={rotationGroup ?? undefined}
      aria-label="اطلاعیه"
    >
      <div className={styles.stack}>
        {visibleBlocks.map((block) => {
          const usesWinnersFiller = blockUsesWinnersFillerBackground(block);

          return (
            <article
              key={block.id}
              className={[
                styles.blockShell,
                usesWinnersFiller ? styles.blockShellWinnersFiller : "",
              ]
                .filter(Boolean)
                .join(" ")}
              data-block-type={block.type}
              data-block-priority={block.priority ?? undefined}
              style={
                usesWinnersFiller
                  ? { backgroundImage: `url(${winnersFillerBg})` }
                  : undefined
              }
            >
              <PlayerPopupContentBlockRenderer block={block} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
