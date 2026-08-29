import type { PlayerPopupBannerBlock } from "@/lib/player-popup-content/types";
import styles from "../PlayerPopupContentSlot.module.css";

export default function PlayerPopupBannerBlockView({
  block,
}: {
  block: PlayerPopupBannerBlock;
}) {
  return (
    <div className={styles.bannerBlock}>
      {block.imageUrl ? (
        <div className={styles.bannerImageWrap}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.imageUrl}
            alt=""
            className={styles.bannerImage}
            aria-hidden={!block.title && !block.body}
          />
        </div>
      ) : null}
      {block.title ? <p className={styles.blockTitle}>{block.title}</p> : null}
      {block.body ? <p className={styles.bannerBody}>{block.body}</p> : null}
    </div>
  );
}
