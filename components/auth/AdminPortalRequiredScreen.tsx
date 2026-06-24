"use client";

import { getAdminHost, getAdminOrigin } from "@/lib/auth/portalHosts";
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
  const adminOrigin = getAdminOrigin();

  const content = (
    <div className={styles.card}>
      <h1 className={styles.title}>ورود به داشبورد مدیریت</h1>
      <p className={styles.text}>
        حساب شما با نقش مدیریتی ثبت شده است. برای ورود به داشبورد مدیریت،
        لطفاً از دامنه <span className={styles.host}>{adminHost}</span>{" "}
        استفاده کنید.
      </p>
      <a href={`${adminOrigin}/login`} className={styles.primaryLink}>
        ورود به داشبورد مدیریت
      </a>
      {onBackToLogin ? (
        <button
          type="button"
          onClick={onBackToLogin}
          className={styles.secondaryButton}
        >
          بازگشت به ورود پلیر
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
