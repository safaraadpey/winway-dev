"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import styles from "./PaymentCallbackPage.module.css";

type UiState =
  | "checking"
  | "credited"
  | "pending"
  | "failed"
  | "cancelled"
  | "verification_error"
  | "missing";

function PaymentCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const depositId = (searchParams.get("depositId") || "").trim();
  const merchantOrderId = (
    searchParams.get("merchantOrderId") ||
    searchParams.get("merchant_order_id") ||
    searchParams.get("orderId") ||
    ""
  ).trim();

  const [ui, setUi] = useState<UiState>("checking");
  const [message, setMessage] = useState("در حال بررسی نتیجه پرداخت...");
  const [busy, setBusy] = useState(false);

  const verify = useCallback(async () => {
    setBusy(true);
    setUi("checking");
    setMessage("در حال بررسی نتیجه پرداخت...");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setUi("verification_error");
        setMessage("برای بررسی پرداخت ابتدا وارد شوید.");
        return;
      }

      const payload: Record<string, unknown> = {};
      if (depositId) {
        payload.depositId = depositId;
      } else if (merchantOrderId) {
        payload.merchantOrderId = merchantOrderId;
      } else {
        // Clean returnUrl (Postman contract) — recover via latest pending intent
        payload.resolveLatest = true;
      }

      const res = await fetch("/api/player/deposit/verify", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 400 && body.error === "invalid_deposit_id") {
        setUi("missing");
        setMessage("شناسه پرداخت یافت نشد.");
        return;
      }

      const nextUi = (body.ui as UiState) || "verification_error";
      setUi(nextUi);
      setMessage(
        body.message ||
          (nextUi === "credited"
            ? "پرداخت با موفقیت انجام شد و کیف پول شما شارژ شد."
            : "خطا در بررسی نتیجه پرداخت.")
      );
    } catch (err) {
      console.error("[Deposit] callback verify failed", err);
      setUi("verification_error");
      setMessage("خطا در بررسی نتیجه پرداخت. می‌توانید دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }, [depositId, merchantOrderId]);

  useEffect(() => {
    void verify();
  }, [verify]);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>نتیجه پرداخت</h1>
        <p className={styles.message} aria-live="polite">
          {message}
        </p>

        {(ui === "pending" || ui === "verification_error") && (
          <button
            type="button"
            className={styles.primaryButton}
            disabled={busy}
            onClick={() => void verify()}
          >
            {busy ? "در حال بررسی…" : "تلاش مجدد بررسی"}
          </button>
        )}

        {ui === "credited" && (
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => router.replace("/player/home")}
          >
            بازگشت به خانه
          </button>
        )}

        {(ui === "failed" || ui === "cancelled" || ui === "missing") && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => router.replace("/player/wallet?action=buy")}
          >
            بازگشت به خرید
          </button>
        )}
      </div>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className={styles.container}>
          <div className={styles.card}>
            <p className={styles.message}>در حال بررسی نتیجه پرداخت...</p>
          </div>
        </div>
      }
    >
      <PaymentCallbackContent />
    </Suspense>
  );
}
