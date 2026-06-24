"use client";

import { getAdminHost } from "@/lib/auth/portalHosts";
import styles from "./AdminPortalRequiredScreen.module.css";

type AdminPortalRequiredScreenProps = {
  onBackToLogin?: () => void;
  asOverlay?: boolean;
};

export default function AdminPortalRequiredScreen({
  onBackToLogin,
  asOverlay = false,
}: AdminPortalRequiredScreenProps) {
  const adminHost = getAdminHost();

  const content = (
    <div className={styles.card}>
      <h1 className={styles.title}>ورود به داشبورد مدیریت</h1>
      <p className={styles.text}>
        حساب شما با نقش مدیریتی ثبت شده است. برای ورود به داشبورد مدیریت،
        لطفاً از دامنه <span className={styles.host}>{adminHost}</span>{" "}
        استفاده کنید.
      </p>
      {onBackToLogin ? (
        <button
          type="button"
          onClick={onBackToLogin}
          className={styles.closeButton}
        >
          متوجه شدم
        </button>
      ) : null}
    </div>
  );

  if (asOverlay) {
    return <div className={styles.backdrop}>{content}</div>;
  }

  return (
    <div className={styles.backdrop} style={{ position: "relative", minHeight: "100vh" }}>
      {content}
    </div>
  );
}
