"use client";

import React from "react";
import WatchInviteGuestSignupButton from "./WatchInviteGuestSignupButton";
import styles from "./WatchInviteGuestPanel.module.css";

type WatchInviteGuestPanelProps = {
  signupPath: string;
};

export default function WatchInviteGuestPanel({ signupPath }: WatchInviteGuestPanelProps) {
  return (
    <div className={styles.root}>
      <WatchInviteGuestSignupButton signupPath={signupPath} />
    </div>
  );
}
