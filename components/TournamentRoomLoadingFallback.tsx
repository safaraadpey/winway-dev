import styles from "./playerScreenLoading.module.css";

type TournamentRoomLoadingFallbackProps = {
  message?: string;
};

export default function TournamentRoomLoadingFallback({
  message,
}: TournamentRoomLoadingFallbackProps) {
  if (message) {
    return (
      <div className={`${styles.page} ${styles.pageCentered}`}>
        <div className={`${styles.skeletonMessageCard} ${styles.message}`}>
          {message}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.skeletonWrap}>
        <div className={`${styles.skeletonCard} space-y-3`}>
          <div className={styles.skeletonLineWide} />
          <div className={styles.skeletonLineMedium} />
        </div>

        <div className={`${styles.skeletonCard} space-y-3`}>
          <div className={styles.skeletonLineShort} />
          <div className={styles.skeletonRows}>
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
            <div className={styles.skeletonRow} />
          </div>
        </div>
      </div>
    </div>
  );
}
