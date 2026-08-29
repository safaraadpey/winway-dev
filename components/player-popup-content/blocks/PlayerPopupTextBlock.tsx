import type { PlayerPopupTextBlock } from "@/lib/player-popup-content/types";
import styles from "../PlayerPopupContentSlot.module.css";

export default function PlayerPopupTextBlockView({
  block,
}: {
  block: PlayerPopupTextBlock;
}) {
  const toneClass =
    block.tone === "accent"
      ? styles.textAccent
      : block.tone === "warning"
        ? styles.textWarning
        : styles.textDefault;

  return (
    <p className={`${styles.textBlock} ${toneClass}`}>{block.text}</p>
  );
}
