import type { PlayerPopupCtaBlock } from "@/lib/player-popup-content/types";
import styles from "../PlayerPopupContentSlot.module.css";

export default function PlayerPopupCtaBlockView({
  block,
}: {
  block: PlayerPopupCtaBlock;
}) {
  if (block.href) {
    return (
      <a
        href={block.href}
        className={styles.ctaButton}
        target="_blank"
        rel="noopener noreferrer"
      >
        {block.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={styles.ctaButton}
      data-popup-action-id={block.actionId}
      disabled={!block.actionId}
    >
      {block.label}
    </button>
  );
}
