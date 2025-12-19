import styles from "./RoomHeader.module.css";

interface RoomHeaderProps {
  linePrize: number;
  fullPrize: number;
  isMuted: boolean;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value || 0);

export default function RoomHeader({
  linePrize,
  fullPrize,
  isMuted,
}: RoomHeaderProps) {
  return (
    <div className={styles.container}>
      <div className={styles.muteButton} aria-label="mute state">
        {isMuted ? "🔇" : "🔊"}
      </div>
      <div className={styles.prizes}>
        <div className={styles.prizeChip}>
          <span className={`${styles.prizeValue} latin-number`}>{formatNumber(linePrize)}</span>
          <span className={styles.prizeLabel}>خط</span>
        </div>
        <div className={styles.prizeChip}>
          <span className={`${styles.prizeValue} latin-number`}>{formatNumber(fullPrize)}</span>
          <span className={styles.prizeLabel}>دبرنا</span>
        </div>
      </div>
    </div>
  );
}
