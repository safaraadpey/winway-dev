"use client";

import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import {
  numberToPersianWords,
  rialsToTomans,
} from "@/lib/format/persianAmountWords";
import { supabase } from "@/lib/supabaseClient";
import { isSyntheticCustomerIdentityUiEnabled } from "@/lib/deposit/syntheticCustomerIdentityClient";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import styles from "./BuyRialPage.module.css";

const syntheticIdentityEnabled = isSyntheticCustomerIdentityUiEnabled();

/** Preset Rial amounts for Buy Rial dropdown (fixed list). */
const BUY_RIAL_PRESET_AMOUNTS_RIAL = [
  530_000,
  870_000,
  1_030_000,
  1_780_000,
  2_550_000,
  4_320_000,
  5_630_000,
  7_240_000,
  10_450_000,
  15_560_000,
] as const;

function formatAmountDisplay(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  return amount.toLocaleString("en-US");
}

function normalizePhoneInput(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(0, 11);
}

function isValidIranMobile(raw: string): boolean {
  return /^09\d{9}$/.test(raw.replace(/\D/g, ""));
}

function isValidFullName(raw: string): boolean {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 3 && name.length <= 120;
}

export default function BuyRialPage() {
  const { setShowBackButton, setOnBackClick } = useHeaderVisibility();
  const [selectedAmountRial, setSelectedAmountRial] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameLocked, setNameLocked] = useState(false);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(true);
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

  useEffect(() => {
    if (syntheticIdentityEnabled) {
      setIdentityLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.user || cancelled) return;

        const { data: profile, error } = await supabase
          .from("user_profiles")
          .select("full_name, phone")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error("[Deposit] BuyRial identity preload failed", error);
          return;
        }

        const savedName = (profile?.full_name || "").trim();
        const savedPhone = (profile?.phone || "").trim();
        if (savedName) {
          setFullName(savedName);
          setNameLocked(true);
        }
        if (savedPhone) {
          setPhone(savedPhone);
          setPhoneLocked(true);
        }
      } catch (err) {
        console.error("[Deposit] BuyRial identity preload failed", err);
      } finally {
        if (!cancelled) setIdentityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const amountValue = selectedAmountRial ? Number(selectedAmountRial) : 0;
  const tomanValue = rialsToTomans(amountValue);
  const nameOk = syntheticIdentityEnabled || isValidFullName(fullName);
  const phoneOk = syntheticIdentityEnabled || isValidIranMobile(phone);
  const canSubmit =
    amountValue > 0 &&
    nameOk &&
    phoneOk &&
    !submitting &&
    !connecting &&
    !identityLoading;

  const handleConfirm = async () => {
    if (!amountValue) {
      toast.error("مبلغ خرید را انتخاب کنید");
      return;
    }
    if (!nameOk) {
      toast.error("نام و نام خانوادگی را کامل وارد کنید");
      return;
    }
    if (!phoneOk) {
      toast.error("شماره موبایل معتبر وارد کنید (مثال: 09123456789)");
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

      const payload: { amountRial: number; fullName?: string; phone?: string } =
        {
          amountRial: amountValue,
        };
      if (!syntheticIdentityEnabled) {
        payload.fullName = fullName.trim();
        payload.phone = phone.trim();
      }

      const res = await fetch("/api/player/deposit/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
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
      setConnecting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>خرید ریالی</h1>

        <div className={styles.panel}>
          {!syntheticIdentityEnabled ? (
            <>
              <label htmlFor="buy-rial-fullname" className={styles.label}>
                نام و نام خانوادگی
              </label>
              <input
                id="buy-rial-fullname"
                className={`${styles.textInput} ${nameLocked ? styles.inputLocked : ""}`}
                type="text"
                dir="rtl"
                placeholder="مثال: علی احمدی"
                value={fullName}
                onChange={(e) => {
                  if (!nameLocked) setFullName(e.target.value);
                }}
                disabled={submitting || connecting || identityLoading}
                readOnly={nameLocked}
                autoComplete="name"
                maxLength={120}
              />

              <label htmlFor="buy-rial-phone" className={styles.labelSecondary}>
                شماره موبایل
              </label>
              <input
                id="buy-rial-phone"
                className={`${styles.amountInput} ${phoneLocked ? styles.inputLocked : ""}`}
                inputMode="tel"
                dir="ltr"
                placeholder="09123456789"
                value={phone}
                onChange={(e) => {
                  if (!phoneLocked) setPhone(normalizePhoneInput(e.target.value));
                }}
                disabled={submitting || connecting || identityLoading}
                readOnly={phoneLocked}
                autoComplete="tel"
              />
              {nameLocked && phoneLocked ? (
                <p className={styles.hint}>
                  مشخصات درگاه قفل شده و قابل تغییر نیست.
                </p>
              ) : (
                <p className={styles.hint}>
                  این مشخصات یک‌بار ثبت می‌شود و بعداً قابل تغییر نیست.
                </p>
              )}
            </>
          ) : null}

          <label htmlFor="buy-rial-amount" className={styles.labelSecondary}>
            مبلغ خرید (ریال)
          </label>
          <div className={styles.amountSelectWrap}>
            <select
              id="buy-rial-amount"
              className={styles.amountSelect}
              dir="ltr"
              value={selectedAmountRial}
              onChange={(e) => setSelectedAmountRial(e.target.value)}
              disabled={submitting || connecting}
              aria-label="مبلغ خرید به ریال"
            >
              <option value="">مبلغ را انتخاب کنید</option>
              {BUY_RIAL_PRESET_AMOUNTS_RIAL.map((amount) => (
                <option key={amount} value={String(amount)}>
                  {formatAmountDisplay(amount)} ریال
                </option>
              ))}
            </select>
          </div>
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
              "مبلغ مورد نظر خود را از لیست انتخاب کنید"
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
