"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import {
  createPlayerWithdrawalRequest,
  loadPlayerWithdrawalList,
} from "@/services/withdrawals";
import type { WithdrawalRequestItem } from "@/src/types/withdrawal";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import { formatCardDisplay, stripCardDigits } from "@/lib/format/cardNumber";
import buyStyles from "./BuyRialPage.module.css";
import styles from "./WithdrawRialPage.module.css";

function formatAmountDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-US");
}

function normalizeCardInput(raw: string): string {
  return formatCardDisplay(raw);
}

function normalizeAmountInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function isValidFullName(raw: string): boolean {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 3 && name.length <= 120;
}

function formatReceiptDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function WithdrawRialPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { tomanBalance, refreshWalletBalances } = useBalancesContext();

  const [amountInput, setAmountInput] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requests, setRequests] = useState<WithdrawalRequestItem[]>([]);
  const [maxBalance, setMaxBalance] = useState<number>(0);

  const amountValue = Number(amountInput || 0);
  const cardDigits = stripCardDigits(cardNumber);

  const refreshRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const data = await loadPlayerWithdrawalList();
      setRequests(data.requests.filter((r) => r.kind === "rial" || !r.kind));
      setMaxBalance(data.freeBalance);
    } catch (err) {
      console.error("[Withdrawal] load list failed", err);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

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

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    if (tomanBalance >= 0 && maxBalance === 0) {
      setMaxBalance(tomanBalance);
    }
  }, [tomanBalance, maxBalance]);

  const canSubmit =
    !submitting &&
    amountValue > 0 &&
    Number.isInteger(amountValue) &&
    amountValue <= maxBalance &&
    cardDigits.length >= 16 &&
    isValidFullName(fullName);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const result = await createPlayerWithdrawalRequest({
        amount: amountValue,
        cardNumber: cardDigits,
        fullName: fullName.trim().replace(/\s+/g, " "),
        clientRequestId: crypto.randomUUID(),
      });

      toast.success(
        result.replayed
          ? "درخواست قبلی شما در حال بررسی است."
          : "درخواست برداشت ثبت شد و در حال بررسی است."
      );

      setAmountInput("");
      setCardNumber("");
      setFullName("");
      await Promise.all([refreshRequests(), refreshWalletBalances?.()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "ثبت درخواست برداشت ناموفق بود."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={buyStyles.container}>
      <div className={buyStyles.content}>
        <h1 className={buyStyles.title}>برداشت ریالی</h1>

        <div className={buyStyles.panel}>
          <label htmlFor="withdraw-rial-amount" className={buyStyles.label}>
            مبلغ برداشت (تومان)
          </label>
          <input
            id="withdraw-rial-amount"
            className={buyStyles.amountInput}
            inputMode="numeric"
            dir="ltr"
            placeholder="0"
            value={amountInput ? formatAmountDisplay(amountValue) : ""}
            onChange={(e) => setAmountInput(normalizeAmountInput(e.target.value))}
            disabled={submitting}
          />
          <p className={buyStyles.hint}>
            حداکثر قابل برداشت:{" "}
            <span className="numeric-text numeric-text--14" dir="ltr">
              {maxBalance.toLocaleString("en-US")}
            </span>{" "}
            تومان
          </p>

          <label htmlFor="withdraw-rial-card" className={buyStyles.labelSecondary}>
            شماره کارت
          </label>
          <input
            id="withdraw-rial-card"
            className={buyStyles.amountInput}
            inputMode="numeric"
            dir="ltr"
            placeholder="6037-xxxx-xxxx-xxxx"
            value={cardNumber}
            onChange={(e) => setCardNumber(normalizeCardInput(e.target.value))}
            disabled={submitting}
            autoComplete="off"
          />

          <label htmlFor="withdraw-rial-name" className={buyStyles.labelSecondary}>
            نام و نام خانوادگی
          </label>
          <input
            id="withdraw-rial-name"
            className={buyStyles.textInput}
            type="text"
            dir="rtl"
            placeholder="مثال: علی احمدی"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={submitting}
            autoComplete="name"
            maxLength={120}
          />

          <button
            type="button"
            className={buyStyles.confirmButton}
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            style={{ backgroundImage: `url(${buyCardButtonBg.src})` }}
          >
            {submitting ? "در حال ارسال…" : "ارسال درخواست"}
          </button>
        </div>

        <section className={styles.receiptSection}>
          <h2 className={styles.receiptTitle}>رسید درخواست‌های برداشت</h2>
          {loadingRequests ? (
            <p className={styles.receiptEmpty}>در حال بارگذاری…</p>
          ) : requests.length === 0 ? (
            <p className={styles.receiptEmpty}>هنوز درخواستی ثبت نشده است.</p>
          ) : (
            <ul className={styles.receiptList}>
              {requests.map((req) => (
                <li key={req.id} className={styles.receiptCard}>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>مبلغ</span>
                    <span className="numeric-text numeric-text--16" dir="ltr">
                      {req.amount.toLocaleString("en-US")} تومان
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>وضعیت</span>
                    <span
                      className={`${styles.statusBadge} ${
                        req.status === "pending"
                          ? styles.statusPending
                          : req.status === "approved"
                            ? styles.statusApproved
                            : styles.statusRejected
                      }`}
                    >
                      {req.statusLabel}
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>کارت</span>
                    <span className="numeric-text numeric-text--14" dir="ltr">
                      {formatCardDisplay(req.cardNumber || "")}
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>نام</span>
                    <span className={styles.receiptValue}>{req.fullName}</span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>زمان</span>
                    <span className={styles.receiptValue}>
                      {formatReceiptDate(req.createdAt)}
                    </span>
                  </div>
                  {req.rejectReason ? (
                    <p className={styles.rejectReason}>دلیل رد: {req.rejectReason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
