import styles from "./RoomHeader.module.css";

interface RoomHeaderProps {
  roomName: string;
  linePrize: number;
  fullPrize: number;
  isMuted: boolean;
}

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value || 0);

export default function RoomHeader({
  roomName,
  linePrize,
  fullPrize,
  isMuted,
}: RoomHeaderProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left}>
        <div className={styles.muteButton} aria-label="mute state">
          {isMuted ? "🔇" : "🔊"}
        </div>
        <span className={styles.roomName}>{roomName} شماره میز</span>
      </div>

      <div className={styles.right}>
        <div className={styles.prizeChip}>
          <span className={`${styles.prizeValue} latin-number`}>{formatNumber(linePrize)}</span>
          <span className={styles.prizeLabel}>برنده خطی</span>
        </div>
        <div className={styles.prizeChip}>
          <span className={`${styles.prizeValue} latin-number`}>{formatNumber(fullPrize)}</span>
          <span className={styles.prizeLabel}>برنده پر</span>
        </div>
      </div>
    </div>
  );
}
