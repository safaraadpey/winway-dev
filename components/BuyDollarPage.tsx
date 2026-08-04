"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { QRCodeSVG } from "qrcode.react";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { supabase } from "@/lib/supabaseClient";
import styles from "./BuyDollarPage.module.css";

type InvoiceBadge = {
  type: string;
  text: string;
  tone: "green" | "orange" | "teal" | string;
};

type InvoiceOption = {
  network: "BEP20" | "TRC20" | "TRX";
  label: string;
  multiplier: number;
  bonusPercent: number;
  finalToman: number;
  requiredCryptoAmount: number;
  cryptoSymbol: "USDT" | "TRX";
  isBestOffer: boolean;
  badges: InvoiceBadge[];
};

type InvoiceQuote = {
  ok: boolean;
  usdAmount: number;
  baseToman: number;
  rates: {
    usdtTomanPrice: number;
    trxUsdPrice: number;
    fetchedAt: string;
  };
  options: InvoiceOption[];
  message?: string;
};

type DepositAddressData = {
  bep20Address: string;
  trc20Address: string;
  derivationIndex: number;
  activeUntil: string;
  priceLock: {
    lockedAt: string;
    expiresAt: string;
    rates: {
      usdtTomanPrice: number;
      trxUsdPrice: number;
      bnbUsdPrice: number;
    };
  };
};

function parseUsdtAmount(raw: string): string {
  const normalized = raw.replace(/[^\d.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot === -1) return normalized;
  const intPart = normalized.slice(0, firstDot).replace(/\./g, "");
  const fracPart = normalized
    .slice(firstDot + 1)
    .replace(/\./g, "")
    .slice(0, 6);
  return fracPart.length > 0 || normalized.endsWith(".")
    ? `${intPart}.${fracPart}`
    : intPart;
}

function formatUsdtDisplay(raw: string): string {
  if (!raw) return "";
  const endsWithDot = raw.endsWith(".");
  const [intRaw = "", fracRaw] = raw.split(".");
  const intNum = intRaw ? Number(intRaw) : 0;
  if (!Number.isFinite(intNum)) return "";
  const intFormatted = intNum.toLocaleString("en-US");
  if (fracRaw !== undefined) {
    return endsWithDot && fracRaw === ""
      ? `${intFormatted}.`
      : `${intFormatted}.${fracRaw}`;
  }
  return intFormatted;
}

function badgeClass(tone: string): string {
  if (tone === "green") return `${styles.badge} ${styles.badgeGreen}`;
  if (tone === "orange") return `${styles.badge} ${styles.badgeOrange}`;
  return `${styles.badge} ${styles.badgeTeal}`;
}

function formatMultiplierBonusBadge(multiplier: number): string {
  const pct = Math.round((Number(multiplier) - 1) * 1000) / 10;
  if (!Number.isFinite(pct) || pct <= 0) return "بونوس ویژه";
  const pctLabel = String(pct).replace(/\.0$/, "");
  return `بونوس ویژه ${pctLabel} درصد قیمت`;
}

async function authHeaders(): Promise<HeadersInit | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export default function BuyDollarPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [amountRaw, setAmountRaw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<InvoiceQuote | null>(null);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [depositAddr, setDepositAddr] = useState<DepositAddressData | null>(
    null
  );
  const [addrLoading, setAddrLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  /** Sticky compact panel: stays while amount > 0 after first successful convert. */
  const [compactLayout, setCompactLayout] = useState(false);

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

  const amountValue = amountRaw ? Number(amountRaw) : 0;
  const canSubmit =
    Number.isFinite(amountValue) && amountValue > 0 && !submitting;

  const applyAmountChange = (nextRaw: string) => {
    setAmountRaw(nextRaw);
    setQuote(null);
    setSelectedNetwork(null);
    setDepositAddr(null);
    const nextValue = nextRaw ? Number(nextRaw) : 0;
    if (!nextRaw || !Number.isFinite(nextValue) || nextValue <= 0) {
      setCompactLayout(false);
    }
  };

  const loadDepositAddress = async () => {
    setAddrLoading(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        toast.error("برای دریافت آدرس ابتدا وارد شوید");
        return;
      }
      const res = await fetch("/api/crypto/deposit-address", {
        method: "GET",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        toast.error(body?.message || "دریافت آدرس واریز ناموفق بود");
        return;
      }
      setDepositAddr(body.data as DepositAddressData);
    } catch (err) {
      console.error("[Payment] deposit-address client failed", err);
      toast.error("دریافت آدرس واریز ناموفق بود");
    } finally {
      setAddrLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!canSubmit) {
      toast.error("مبلغ خرید را وارد کنید");
      return;
    }

    setSubmitting(true);
    setQuote(null);
    setSelectedNetwork(null);
    setDepositAddr(null);

    try {
      console.log("[Payment] BuyDollar convert requested", {
        amountUsdt: amountValue,
      });

      const res = await fetch("/api/deposit/calculate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usdAmount: amountValue }),
      });

      const body = (await res.json().catch(() => ({}))) as InvoiceQuote & {
        error?: string;
        message?: string;
      };

      if (!res.ok || !body?.ok || !Array.isArray(body.options)) {
        toast.error(
          body?.message ||
            "محاسبه فاکتور ناموفق بود. لطفاً دوباره تلاش کنید."
        );
        return;
      }

      setQuote(body);
      const bestOffer = body.options.find((o) => o.isBestOffer);
      setSelectedNetwork(bestOffer?.network ?? body.options[0]?.network ?? null);
      setCompactLayout(true);
      await loadDepositAddress();
    } catch (err) {
      console.error("[Payment] calculate-invoice client failed", err);
      toast.error("اتصال به سرویس قیمت ناموفق بود.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCheckDeposit = async () => {
    setChecking(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        toast.error("برای استعلام ابتدا وارد شوید");
        return;
      }
      const res = await fetch("/api/crypto/check-my-deposit", {
        method: "POST",
        headers,
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        toast.error(body?.message || "لطفاً کمی صبر کنید");
        return;
      }
      if (!res.ok || !body?.ok) {
        toast.error(body?.message || "استعلام واریز ناموفق بود");
        return;
      }
      const confirmed = body.data?.confirmed?.length ?? 0;
      const pending = body.data?.pending?.length ?? 0;
      if (confirmed > 0) {
        toast.success(
          `واریز تأیید شد — ${body.data.confirmed[0].tomanAmount?.toLocaleString("en-US")} تومان`
        );
      } else if (pending > 0) {
        toast("تراکنش مشاهده شد؛ در انتظار تأیید شبکه…");
      } else {
        toast("هنوز واریز جدیدی یافت نشد");
      }
    } catch (err) {
      console.error("[Payment] check-my-deposit client failed", err);
      toast.error("استعلام واریز ناموفق بود");
    } finally {
      setChecking(false);
    }
  };

  const displayAddress =
    selectedNetwork === "BEP20"
      ? depositAddr?.bep20Address
      : depositAddr?.trc20Address;

  const addressNetworkLabel =
    selectedNetwork === "BEP20"
      ? "BEP-20 (BNB / USDT)"
      : selectedNetwork === "TRX"
        ? "TRON (TRX)"
        : "TRC-20 (USDT)";

  const hasOptions = Boolean(quote?.options?.length);

  const checkDepositButton = (
    <button
      type="button"
      className={styles.secondaryButton}
      disabled={checking}
      onClick={() => void handleCheckDeposit()}
    >
      {checking ? "در حال استعلام…" : "بررسی واریز من"}
    </button>
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>خرید رمز ارزی</h1>

        <div
          className={`${styles.panel} ${
            compactLayout ? styles.panelCompact : ""
          }`}
        >
          {compactLayout ? (
            <div className={styles.amountRow}>
              <button
                type="button"
                className={styles.convertInlineButton}
                disabled={!canSubmit}
                onClick={() => void handleConfirm()}
              >
                {submitting ? "…" : "تبدیل"}
              </button>
              <div className={styles.amountFieldWrap}>
                <input
                  id="buy-dollar-amount"
                  className={`${styles.amountInput} ${styles.amountInputCompact}`}
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0"
                  aria-label="مبلغ خرید USDT"
                  value={formatUsdtDisplay(amountRaw)}
                  onChange={(e) =>
                    applyAmountChange(parseUsdtAmount(e.target.value))
                  }
                  disabled={submitting}
                  autoComplete="off"
                />
                <span className={styles.amountSuffix} aria-hidden="true">
                  USDT
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.amountFieldWrap}>
                <input
                  id="buy-dollar-amount"
                  className={styles.amountInput}
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="0"
                  aria-label="مبلغ خرید USDT"
                  value={formatUsdtDisplay(amountRaw)}
                  onChange={(e) =>
                    applyAmountChange(parseUsdtAmount(e.target.value))
                  }
                  disabled={submitting}
                  autoComplete="off"
                />
                <span className={styles.amountSuffix} aria-hidden="true">
                  USDT
                </span>
              </div>
              <p
                className={`${styles.hint} ${
                  amountValue > 0 ? styles.hintLive : ""
                }`}
                aria-live="polite"
              >
                {amountValue > 0
                  ? "برای دیدن قیمت شبکه‌ها «تبدیل و خرید» را بزنید"
                  : "مبلغ مورد نظر خود را وارد کنید"}
              </p>

              {submitting ? (
                <p className={styles.connecting} aria-live="polite">
                  در حال دریافت قیمت زنده و محاسبه فاکتور…
                </p>
              ) : null}

              <button
                type="button"
                className={styles.confirmButton}
                disabled={!canSubmit}
                onClick={() => void handleConfirm()}
              >
                {submitting ? "در حال محاسبه…" : "تبدیل و خرید"}
              </button>
            </>
          )}
        </div>

        {!hasOptions ? checkDepositButton : null}

        {hasOptions ? (
          <div className={styles.optionsSection}>
            <p className={styles.ratesMeta}>
              قیمت پایه تتر:{" "}
              <span className={styles.amountAccent} dir="ltr">
                {quote!.rates.usdtTomanPrice.toLocaleString("en-US")}
              </span>{" "}
              تومان · TRX:{" "}
              <span className={styles.amountAccent} dir="ltr">
                $
                {quote!.rates.trxUsdPrice.toLocaleString("en-US", {
                  maximumFractionDigits: 6,
                })}
              </span>
            </p>

            {[...quote!.options]
              .sort(
                (a, b) => Number(b.multiplier) - Number(a.multiplier)
              )
              .map((opt) => {
              const selected = selectedNetwork === opt.network;
              return (
                <button
                  key={opt.network}
                  type="button"
                  className={[
                    styles.networkCard,
                    selected ? styles.networkCardSelected : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedNetwork(opt.network)}
                >
                  <div className={styles.cardHeader}>
                    <span className={styles.cardNetwork}>{opt.label}</span>
                  </div>

                  {opt.badges?.length ? (
                    <div className={styles.badgeRow}>
                      {opt.badges.map((b) => (
                        <span
                          key={`${opt.network}-${b.type}-${b.text}`}
                          className={badgeClass(b.tone)}
                        >
                          {b.type === "best_bonus" ||
                          b.type === "multiplier_bonus"
                            ? formatMultiplierBonusBadge(opt.multiplier)
                            : b.text}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div>
                    <span className={styles.cardPrice} dir="ltr">
                      {opt.finalToman.toLocaleString("en-US")}
                    </span>
                    <span className={styles.cardPriceUnit}>تومان</span>
                  </div>

                  <p className={styles.cardSub}>
                    {opt.network === "TRX" ? (
                      <>
                        معادل{" "}
                        <span className={styles.cardSubAmount} dir="ltr">
                          {opt.requiredCryptoAmount.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
                          })}
                        </span>{" "}
                        TRX · ضریب{" "}
                        <span className={styles.cardSubAmount} dir="ltr">
                          {opt.multiplier}
                        </span>
                      </>
                    ) : (
                      <>
                        واریز{" "}
                        <span className={styles.cardSubAmount} dir="ltr">
                          {opt.requiredCryptoAmount.toLocaleString("en-US", {
                            maximumFractionDigits: 6,
                          })}
                        </span>{" "}
                        USDT · ضریب{" "}
                        <span className={styles.cardSubAmount} dir="ltr">
                          {opt.multiplier}
                        </span>
                      </>
                    )}
                  </p>
                </button>
              );
            })}

            <div className={styles.addressPanel}>
              <div className={styles.addressLabel}>
                آدرس واریز {addressNetworkLabel}
              </div>
              {addrLoading ? (
                <p className={styles.addressHint}>در حال آماده‌سازی آدرس…</p>
              ) : displayAddress ? (
                <>
                  <div className={styles.qrWrap} aria-hidden="false">
                    <div className={styles.qrFrame}>
                      <QRCodeSVG
                        value={displayAddress}
                        size={168}
                        level="M"
                        includeMargin={false}
                        bgColor="#ffffff"
                        fgColor="#0e0e0f"
                        title={`QR آدرس ${addressNetworkLabel}`}
                      />
                    </div>
                    <p className={styles.qrCaption}>
                      اسکن کنید تا آدرس واریز وارد کیف پول شود
                    </p>
                  </div>
                  <div className={styles.addressValue} dir="ltr">
                    {displayAddress}
                  </div>
                  <button
                    type="button"
                    className={styles.copyButton}
                    onClick={() => {
                      void navigator.clipboard.writeText(displayAddress);
                      toast.success("آدرس کپی شد");
                    }}
                  >
                    کپی آدرس
                  </button>
                  {depositAddr?.priceLock?.expiresAt ? (
                    <p className={styles.addressHint}>
                      🔒 نرخ تبدیل این پرداخت تا ۳۰ دقیقه برای شما تضمین
                      می‌شود. در این مدت، حتی اگر قیمت کاهش پیدا کند، مبلغ شارژ
                      با همین نرخ محاسبه خواهد شد. پس از پایان این مهلت، نرخ
                      لحظه‌ای بازار ملاک محاسبه خواهد بود.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className={styles.addressHint}>
                  آدرس در دسترس نیست. دوباره «تبدیل و خرید» را بزنید.
                </p>
              )}
            </div>

            {checkDepositButton}
          </div>
        ) : null}
      </div>
    </div>
  );
}
