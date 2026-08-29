import type { PlayerPopupWinnersBlock } from "@/lib/player-popup-content/types";
import styles from "../PlayerPopupContentSlot.module.css";

function resolveWinnersPrizeLabel(block: PlayerPopupWinnersBlock): string | null {
  if (block.prizeLabel) {
    return block.prizeLabel;
  }

  const labels = new Set(
    block.winners
      .map((winner) => winner.prizeLabel?.trim())
      .filter((label): label is string => Boolean(label))
  );

  if (labels.size === 1) {
    return [...labels][0];
  }

  return null;
}

export default function PlayerPopupWinnersBlockView({
  block,
}: {
  block: PlayerPopupWinnersBlock;
}) {
  if (block.winners.length === 0) {
    return null;
  }

  const prizeLabel = resolveWinnersPrizeLabel(block);

  return (
    <div className={styles.winnersBlock}>
      {block.title || prizeLabel ? (
        <div className={styles.winnersHeader}>
          {block.title ? (
            <p className={styles.winnersTitle}>{block.title}</p>
          ) : null}
          {prizeLabel ? (
            <p className={styles.winnersPrizeLabel}>{prizeLabel}</p>
          ) : null}
        </div>
      ) : null}
      <ul className={styles.winnersList}>
        {block.winners.map((winner, index) => (
          <li key={`${block.id}-${index}`} className={styles.winnerItem}>
            <div className={styles.winnerIdentity}>
              <span
                className={`${styles.winnerRank} numeric-text numeric-text--12`}
                dir="ltr"
              >
                {(index + 1).toLocaleString("en-US")}.
              </span>
              <span className={styles.winnerName}>{winner.name}</span>
            </div>
            {winner.prizeAmount != null ? (
              <span className={styles.winnerPrize}>
                <span className="numeric-text numeric-text--12" dir="ltr">
                  {winner.prizeAmount.toLocaleString("en-US")}
                </span>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
