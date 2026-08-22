"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import {
  createPlayerWithdrawalRequest,
  cancelPlayerWithdrawalRequest,
  loadPlayerWithdrawalList,
} from "@/services/withdrawals";
import type { WithdrawalRequestItem } from "@/src/types/withdrawal";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import { formatCardDisplay, stripCardDigits } from "@/lib/format/cardNumber";
import {
  formatShebaDisplay,
  isValidSheba,
  normalizeSheba,
} from "@/lib/format/shebaNumber";
import { MIN_RIAL_WITHDRAWAL_AMOUNT, MAX_RIAL_WITHDRAWAL_CARD_DIGITS } from "@/lib/withdrawal/constants";
import buyStyles from "./BuyRialPage.module.css";
import styles from "./WithdrawRialPage.module.css";

function formatAmountDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-US");
}

function normalizeCardInput(raw: string): string {
  const clean = String(raw || "")
    .replace(/\D/g, "")
    .slice(0, MAX_RIAL_WITHDRAWAL_CARD_DIGITS);
  return clean.replace(/(\d{4})(?=\d)/g, "$1-");
}

function normalizeShebaInput(raw: string): string {
  return formatShebaDisplay(raw);
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

function getReceiptStatusClass(status: WithdrawalRequestItem["status"]): string {
  switch (status) {
    case "pending":
      return styles.statusPending;
    case "processing":
      return styles.statusProcessing;
    case "approved":
      return styles.statusApproved;
    case "cancelled":
      return styles.statusCancelled;
    default:
      return styles.statusRejected;
  }
}

export default function WithdrawRialPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { tomanBalance, refreshWalletBalances } = useBalancesContext();

  const [amountInput, setAmountInput] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [shebaNumber, setShebaNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requests, setRequests] = useState<WithdrawalRequestItem[]>([]);
  const [maxBalance, setMaxBalance] = useState<number>(0);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(
    null
  );

  const amountValue = Number(amountInput || 0);
  const cardDigits = stripCardDigits(cardNumber);
  const shebaNormalized = normalizeSheba(shebaNumber);

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

  const balanceBelowMinimum = maxBalance < MIN_RIAL_WITHDRAWAL_AMOUNT;
  const showAmountError =
    !balanceBelowMinimum &&
    amountInput.trim().length > 0 &&
    (amountValue < MIN_RIAL_WITHDRAWAL_AMOUNT || amountValue > maxBalance);
  const showCardError =
    cardNumber.trim().length > 0 &&
    cardDigits.length !== MAX_RIAL_WITHDRAWAL_CARD_DIGITS;
  const showShebaError =
    shebaNumber.trim().length > 0 && !isValidSheba(shebaNormalized);

  const canSubmit =
    !submitting &&
    !balanceBelowMinimum &&
    amountValue >= MIN_RIAL_WITHDRAWAL_AMOUNT &&
    Number.isInteger(amountValue) &&
    amountValue <= maxBalance &&
    cardDigits.length === MAX_RIAL_WITHDRAWAL_CARD_DIGITS &&
    isValidSheba(shebaNormalized) &&
    isValidFullName(fullName);

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const result = await createPlayerWithdrawalRequest({
        amount: amountValue,
        cardNumber: cardDigits,
        shebaNumber: shebaNormalized,
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
      setShebaNumber("");
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

  const handleCancel = async (requestId: string) => {
    if (cancellingRequestId) return;
    setCancellingRequestId(requestId);
    try {
      const result = await cancelPlayerWithdrawalRequest(requestId);
      toast.success(result.message || "درخواست لغو شد.");
      await Promise.all([refreshRequests(), refreshWalletBalances?.()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "لغو درخواست ناموفق بود."
      );
    } finally {
      setCancellingRequestId(null);
    }
  };

  return (
    <div className={buyStyles.container}>
      <div className={buyStyles.content}>
        <h1 className={buyStyles.title}>برداشت ریالی</h1>

        <div className={buyStyles.panel}>
          <div className={styles.amountFieldHeader}>
            <label htmlFor="withdraw-rial-amount" className={`${buyStyles.label} ${styles.fieldLabel}`}>
              مبلغ برداشت (تومان)
            </label>
            {showAmountError ? (
              <p className={styles.fieldError}>مبلغ برداشت را به شکل صحیح وارد کنید</p>
            ) : null}
          </div>
          <input
            id="withdraw-rial-amount"
            className={`${buyStyles.amountInput} ${styles.compactField}${
              balanceBelowMinimum ? ` ${buyStyles.inputLocked}` : ""
            }`}
            inputMode="numeric"
            dir="ltr"
            placeholder={`حداقل مبلغ برداشت: ${MIN_RIAL_WITHDRAWAL_AMOUNT.toLocaleString("en-US")} تومان`}
            value={amountInput ? formatAmountDisplay(amountValue) : ""}
            onChange={(e) => setAmountInput(normalizeAmountInput(e.target.value))}
            disabled={submitting || balanceBelowMinimum}
          />
          <p
            className={
              balanceBelowMinimum ? styles.insufficientBalanceHint : buyStyles.hint
            }
          >
            {balanceBelowMinimum ? (
              "دارایی کیف پول شما کمتر از حداقل قابل برداشت میباشد و قادر به انجام اینکار نمیباشید."
            ) : (
              <>
                شما تا سقف{" "}
                <span className="numeric-text numeric-text--14" dir="ltr">
                  {maxBalance.toLocaleString("en-US")}
                </span>{" "}
                تومان امکان برداشت دارید.
              </>
            )}
          </p>

          <div className={styles.fieldHeader}>
            <label
              htmlFor="withdraw-rial-card"
              className={`${buyStyles.labelSecondary} ${styles.fieldLabel}`}
            >
              شماره کارت
            </label>
            {showCardError ? (
              <p className={styles.fieldError}>شماره کارت را به شکل صحیح وارد کنید</p>
            ) : null}
          </div>
          <input
            id="withdraw-rial-card"
            className={`${buyStyles.amountInput} ${styles.compactField}`}
            inputMode="numeric"
            dir="ltr"
            placeholder="6037-xxxx-xxxx-xxxx"
            value={cardNumber}
            onChange={(e) => setCardNumber(normalizeCardInput(e.target.value))}
            disabled={submitting}
            autoComplete="off"
            maxLength={MAX_RIAL_WITHDRAWAL_CARD_DIGITS + 3}
          />

          <div className={styles.fieldHeader}>
            <label
              htmlFor="withdraw-rial-sheba"
              className={`${buyStyles.labelSecondary} ${styles.fieldLabel}`}
            >
              شماره شبا
            </label>
            {showShebaError ? (
              <p className={styles.fieldError}>شماره شبا را به شکل صحیح وارد کنید</p>
            ) : null}
          </div>
          <input
            id="withdraw-rial-sheba"
            className={`${buyStyles.amountInput} ${styles.compactField}`}
            inputMode="text"
            dir="ltr"
            placeholder="IR12-3456-7890-1234-5678-9012-34"
            value={shebaNumber}
            onChange={(e) => setShebaNumber(normalizeShebaInput(e.target.value))}
            disabled={submitting}
            autoComplete="off"
            maxLength={34}
          />

          <label htmlFor="withdraw-rial-name" className={buyStyles.labelSecondary}>
            نام و نام خانوادگی
          </label>
          <input
            id="withdraw-rial-name"
            className={`${buyStyles.textInput} ${styles.compactField}`}
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
                    <span className={styles.receiptNumeric16} dir="ltr">
                      {req.amount.toLocaleString("en-US")} تومان
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>وضعیت</span>
                    <span
                      className={`${styles.statusBadge} ${getReceiptStatusClass(req.status)}`}
                    >
                      {req.statusLabel}
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>کارت</span>
                    <span className={styles.receiptNumeric14} dir="ltr">
                      {formatCardDisplay(req.cardNumber || "")}
                    </span>
                  </div>
                  {req.shebaNumber ? (
                    <div className={styles.receiptRow}>
                      <span className={styles.receiptLabel}>شبا</span>
                      <span className={styles.receiptNumeric14} dir="ltr">
                        {formatShebaDisplay(req.shebaNumber)}
                      </span>
                    </div>
                  ) : null}
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
                  {req.reviewNote || req.rejectReason ? (
                    <p
                      className={
                        req.status === "rejected"
                          ? styles.rejectReason
                          : styles.reviewNote
                      }
                    >
                      توضیحات بررسی: {req.reviewNote || req.rejectReason}
                    </p>
                  ) : null}
                  {req.status === "pending" ? (
                    <button
                      type="button"
                      className={styles.cancelButton}
                      disabled={cancellingRequestId === req.id}
                      onClick={() => void handleCancel(req.id)}
                    >
                      {cancellingRequestId === req.id ? "در حال لغو…" : "لغو درخواست"}
                    </button>
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
