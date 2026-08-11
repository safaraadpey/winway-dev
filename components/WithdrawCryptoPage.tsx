"use client";

import React, { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import {
  calculateAllCryptoWithdrawQuotes,
  cancelPlayerWithdrawalRequest,
  createCryptoWithdrawalRequest,
  loadPlayerWithdrawalList,
} from "@/services/withdrawals";
import type {
  CryptoNetwork,
  CryptoWithdrawQuoteResponse,
  WithdrawalRequestItem,
} from "@/src/types/withdrawal";
import { getNetworkLabel } from "@/src/types/withdrawal";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import buyStyles from "./BuyRialPage.module.css";
import styles from "./WithdrawCryptoPage.module.css";

const NETWORKS: CryptoNetwork[] = ["TRC20", "BEP20", "TRX"];

function formatAmountDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-US");
}

function normalizeAmountInput(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
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

function formatCryptoAmount(amount: number): string {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export default function WithdrawCryptoPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const { tomanBalance, refreshWalletBalances } = useBalancesContext();

  const [amountInput, setAmountInput] = useState("");
  const [network, setNetwork] = useState<CryptoNetwork>("TRC20");
  const [quotesByNetwork, setQuotesByNetwork] = useState<
    Partial<Record<CryptoNetwork, CryptoWithdrawQuoteResponse>>
  >({});
  const [walletAddress, setWalletAddress] = useState("");
  const [converting, setConverting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requests, setRequests] = useState<WithdrawalRequestItem[]>([]);
  const [maxBalance, setMaxBalance] = useState(0);
  const [cancellingRequestId, setCancellingRequestId] = useState<string | null>(
    null
  );

  const amountValue = Number(amountInput || 0);
  const effectiveMaxBalance =
    maxBalance > 0 ? maxBalance : Math.max(0, tomanBalance);

  const refreshRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const data = await loadPlayerWithdrawalList();
      setRequests(
        data.requests.filter((r) => r.kind === "crypto")
      );
      setMaxBalance(data.freeBalance);
    } catch (err) {
      console.error("[Withdrawal] crypto list failed", err);
      if (tomanBalance > 0) {
        setMaxBalance(tomanBalance);
      }
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
    void refreshWalletBalances?.();
    void refreshRequests();
  }, [refreshRequests, refreshWalletBalances]);

  useEffect(() => {
    if (tomanBalance > 0 && maxBalance === 0) {
      setMaxBalance(tomanBalance);
    }
  }, [tomanBalance, maxBalance]);

  const quote = quotesByNetwork[network] ?? null;
  const hasQuotes = NETWORKS.some((net) => quotesByNetwork[net]);

  useEffect(() => {
    setQuotesByNetwork({});
  }, [amountInput]);

  const canConvert =
    !converting &&
    amountValue > 0 &&
    Number.isInteger(amountValue) &&
    amountValue <= effectiveMaxBalance;

  const canSubmit =
    !submitting &&
    !!quote &&
    walletAddress.trim().length >= 10 &&
    quote.lockedToman <= effectiveMaxBalance;

  const handleConvert = async () => {
    if (!canConvert) return;
    setConverting(true);
    try {
      const results = await calculateAllCryptoWithdrawQuotes(amountValue);
      setQuotesByNetwork(results);
      toast.success("مبلغ رمز ارزی برای هر سه شبکه محاسبه شد.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "محاسبه تبدیل ناموفق بود."
      );
    } finally {
      setConverting(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !quote) return;
    setSubmitting(true);
    try {
      const result = await createCryptoWithdrawalRequest({
        network: quote.network,
        cryptoAmount: quote.cryptoAmount,
        cryptoSymbol: quote.cryptoSymbol,
        lockedToman: quote.lockedToman,
        requestedToman: quote.requestedToman,
        walletAddress: walletAddress.trim(),
        clientRequestId: crypto.randomUUID(),
        quotedAt: quote.quotedAt,
      });

      toast.success(
        result.replayed
          ? "درخواست قبلی شما در حال بررسی است."
          : "درخواست برداشت رمز ارزی ثبت شد."
      );

      setAmountInput("");
      setWalletAddress("");
      setQuotesByNetwork({});
      await Promise.all([refreshRequests(), refreshWalletBalances?.()]);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "ثبت درخواست ناموفق بود."
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
        <h1 className={buyStyles.title}>برداشت رمز ارزی</h1>

        <div className={buyStyles.panel}>
          <label htmlFor="withdraw-crypto-amount" className={buyStyles.label}>
            مبلغ برداشت (تومان)
          </label>
          <input
            id="withdraw-crypto-amount"
            className={buyStyles.amountInput}
            inputMode="numeric"
            dir="ltr"
            placeholder="0"
            value={amountInput ? formatAmountDisplay(amountValue) : ""}
            onChange={(e) => setAmountInput(normalizeAmountInput(e.target.value))}
            disabled={converting || submitting}
          />
          <p className={buyStyles.hint}>
            حداکثر قابل برداشت:{" "}
            <span className="numeric-text numeric-text--14" dir="ltr">
              {effectiveMaxBalance.toLocaleString("en-US")}
            </span>{" "}
            تومان
          </p>

          <p className={buyStyles.labelSecondary}>شبکه مقصد</p>
          <div className={styles.networkRow}>
            {NETWORKS.map((net) => (
              <button
                key={net}
                type="button"
                className={`${styles.networkChip} ${
                  network === net ? styles.networkChipActive : ""
                }`}
                onClick={() => setNetwork(net)}
                disabled={converting || submitting}
              >
                {getNetworkLabel(net)}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={buyStyles.confirmButton}
            disabled={!canConvert}
            onClick={() => void handleConvert()}
            style={{ backgroundImage: `url(${buyCardButtonBg.src})` }}
          >
            {converting ? "در حال تبدیل…" : "تأیید و تبدیل"}
          </button>

          {hasQuotes && quote ? (
            <div className={styles.quoteBox}>
              <p className={styles.quoteTitle}>نتیجه تبدیل</p>
              <div className={styles.quoteRow}>
                <span>مبلغ رمز ارزی قابل پرداخت</span>
                <span className="numeric-text numeric-text--18" dir="ltr">
                  {formatCryptoAmount(quote.cryptoAmount)}{" "}
                  {quote.cryptoSymbol}
                </span>
              </div>
              <div className={styles.quoteRow}>
                <span>مبلغ برداشت</span>
                <span className="numeric-text numeric-text--16" dir="ltr">
                  {quote.lockedToman.toLocaleString("en-US")} تومان
                </span>
              </div>
              <p className={buyStyles.hint}>
                شبکه: {getNetworkLabel(quote.network)}
              </p>
            </div>
          ) : null}

          {hasQuotes && quote ? (
            <>
              <label
                htmlFor="withdraw-crypto-address"
                className={buyStyles.labelSecondary}
              >
                آدرس کیف پول
              </label>
              <input
                id="withdraw-crypto-address"
                className={buyStyles.amountInput}
                dir="ltr"
                placeholder={
                  network === "BEP20"
                    ? "0x..."
                    : "T..."
                }
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value.trim())}
                disabled={submitting}
                autoComplete="off"
              />

              <button
                type="button"
                className={`${buyStyles.confirmButton} ${styles.submitButton}`}
                disabled={!canSubmit}
                onClick={() => void handleSubmit()}
                style={{ backgroundImage: `url(${buyCardButtonBg.src})` }}
              >
                {submitting ? "در حال ثبت…" : "ثبت درخواست"}
              </button>
            </>
          ) : null}
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
                    <span className={styles.receiptLabel}>مبلغ رمز</span>
                    <span className={styles.receiptNumeric16} dir="ltr">
                      {formatCryptoAmount(req.cryptoAmount ?? 0)}{" "}
                      {req.cryptoSymbol}
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>بلاک تومانی</span>
                    <span className={styles.receiptNumeric14} dir="ltr">
                      {req.amount.toLocaleString("en-US")} تومان
                    </span>
                  </div>
                  <div className={styles.receiptRow}>
                    <span className={styles.receiptLabel}>شبکه</span>
                    <span className={styles.receiptValue}>
                      {req.network ? getNetworkLabel(req.network) : "—"}
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
                  {req.walletAddress ? (
                    <p className={styles.addressLine} dir="ltr">
                      {req.walletAddress}
                    </p>
                  ) : null}
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
                          ? styles.reviewNoteRejected
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
