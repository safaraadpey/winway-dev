"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { WatchInviteBanner } from "@/lib/watch-invite/types";
import styles from "./WatchInviteGuestPanel.module.css";

type WatchInviteGuestPanelProps = {
  banner: WatchInviteBanner | null;
  signupPath: string;
};

export default function WatchInviteGuestPanel({
  banner,
  signupPath,
}: WatchInviteGuestPanelProps) {
  const router = useRouter();

  return (
    <div className={styles.root}>
      {banner?.isEnabled && banner.imageUrl ? (
        <div className={styles.bannerCard}>
          {banner.title ? <div className={styles.bannerTitle}>{banner.title}</div> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.imageUrl}
            alt={banner.title || "بنر دعوت"}
            className={styles.bannerImage}
          />
          {banner.caption ? (
            <div className={styles.bannerCaption}>{banner.caption}</div>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className={styles.signupButton}
        onClick={() => router.push(signupPath)}
      >
        ثبت‌نام
      </button>
    </div>
  );
}
