import styles from "./playerScreenLoading.module.css";

type PageLoadingProps = {
  message?: string;
};

export default function PageLoading({
  message = "در حال بارگذاری...",
}: PageLoadingProps) {
  return (
    <div className={`${styles.page} ${styles.pageCentered}`}>
      <div className={styles.spinner} aria-hidden="true" />
      <p className={styles.message}>{message}</p>
    </div>
  );
}
