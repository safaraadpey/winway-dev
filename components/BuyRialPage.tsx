"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  numberToPersianWords,
  rialsToTomans,
} from "@/lib/format/persianAmountWords";
import { supabase } from "@/lib/supabaseClient";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import styles from "./BuyRialPage.module.css";

function parseAmountDigits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

function formatAmountDisplay(digits: string): string {
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

export default function BuyRialPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [amountDigits, setAmountDigits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    setShowBackButton(true);
    setOnBackClick(() => () => {
      window.history.back();
    });
    return () => {
      setShowBackButton(false);
      setOnBackClick(null);
    };
  }, [setShowBackButton, setOnBackClick]);

  const amountValue = amountDigits ? Number(amountDigits) : 0;
  const tomanValue = rialsToTomans(amountValue);
  const canSubmit = amountValue > 0 && !submitting && !connecting;

  const handleConfirm = async () => {
    if (!canSubmit) {
      toast.error("مبلغ خرید را وارد کنید");
      return;
    }

    setSubmitting(true);
    setConnecting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error("برای خرید ابتدا وارد شوید");
        return;
      }

      const res = await fetch("/api/player/deposit/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ amountRial: amountValue }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok || !body?.paymentUrl) {
        toast.error(
          body?.message ||
            "اتصال به درگاه پرداخت ناموفق بود. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      // Redirect to HamiPay — do not touch wallet balance here.
      window.location.assign(String(body.paymentUrl));
    } catch (err) {
      console.error("[Deposit] create from BuyRial failed", err);
      toast.error("اتصال به درگاه پرداخت ناموفق بود. لطفاً دوباره تلاش کنید.");
    } finally {
      setSubmitting(false);
      // Keep connecting true if we redirected; otherwise reset
      setConnecting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>خرید ریالی</h1>

        <div className={styles.panel}>
          <label htmlFor="buy-rial-amount" className={styles.label}>
            مبلغ خرید (ریال)
          </label>
          <input
            id="buy-rial-amount"
            className={styles.amountInput}
            inputMode="numeric"
            dir="ltr"
            placeholder="0"
            value={formatAmountDisplay(amountDigits)}
            onChange={(e) => setAmountDigits(parseAmountDigits(e.target.value))}
            disabled={submitting || connecting}
            autoComplete="off"
          />
          <p
            className={`${styles.hint} ${amountValue > 0 ? styles.hintLive : ""}`}
            aria-live="polite"
          >
            {amountValue > 0 ? (
              <>
                <span className={styles.tomanAmount} dir="ltr">
                  {tomanValue.toLocaleString("en-US")}
                </span>
                {" تومان — "}
                <span className={styles.tomanWords}>
                  {numberToPersianWords(tomanValue)} تومان
                </span>
              </>
            ) : (
              "مبلغ مورد نظر خود را وارد کنید"
            )}
          </p>

          {connecting ? (
            <p className={styles.connecting} aria-live="polite">
              در حال اتصال به درگاه پرداخت...
            </p>
          ) : null}

          <button
            type="button"
            className={styles.confirmButton}
            disabled={!canSubmit}
            onClick={() => void handleConfirm()}
            style={{ backgroundImage: `url(${buyCardButtonBg.src})` }}
          >
            {connecting ? "در حال اتصال…" : "تأیید خرید"}
          </button>
        </div>
      </div>
    </div>
  );
}
