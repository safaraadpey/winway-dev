"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const [amountPickerOpen, setAmountPickerOpen] = useState(false);
  const [showAmountListBottomFade, setShowAmountListBottomFade] = useState(false);
  const amountPickerListRef = useRef<HTMLUListElement>(null);

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

  useEffect(() => {
    if (!amountPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAmountPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [amountPickerOpen]);

  const updateAmountListBottomFade = useCallback(() => {
    const list = amountPickerListRef.current;
    if (!list) {
      setShowAmountListBottomFade(false);
      return;
    }
    const hasOverflow = list.scrollHeight > list.clientHeight + 1;
    const atBottom =
      list.scrollTop + list.clientHeight >= list.scrollHeight - 8;
    setShowAmountListBottomFade(hasOverflow && !atBottom);
  }, []);

  useEffect(() => {
    if (!amountPickerOpen) {
      setShowAmountListBottomFade(false);
      return;
    }

    const list = amountPickerListRef.current;
    updateAmountListBottomFade();
    const raf = window.requestAnimationFrame(updateAmountListBottomFade);

    list?.addEventListener("scroll", updateAmountListBottomFade, {
      passive: true,
    });
    window.addEventListener("resize", updateAmountListBottomFade);

    return () => {
      window.cancelAnimationFrame(raf);
      list?.removeEventListener("scroll", updateAmountListBottomFade);
      window.removeEventListener("resize", updateAmountListBottomFade);
    };
  }, [amountPickerOpen, updateAmountListBottomFade]);

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

  const amountPickerDisabled = submitting || connecting;
  const selectedAmountLabel = amountValue
    ? `${formatAmountDisplay(amountValue)} ریال`
    : "مبلغ را انتخاب کنید";

  const handleAmountPick = (amount: number) => {
    setSelectedAmountRial(String(amount));
    setAmountPickerOpen(false);
  };

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

          <label id="buy-rial-amount-label" className={styles.labelSecondary}>
            مبلغ خرید (ریال)
          </label>
          <div className={styles.amountSelectWrap}>
            <button
              id="buy-rial-amount"
              type="button"
              className={`${styles.amountSelectTrigger} ${
                amountValue > 0 ? styles.amountSelectTriggerFilled : ""
              }`}
              dir="ltr"
              disabled={amountPickerDisabled}
              aria-haspopup="dialog"
              aria-expanded={amountPickerOpen}
              aria-labelledby="buy-rial-amount-label"
              onClick={() => {
                if (!amountPickerDisabled) setAmountPickerOpen(true);
              }}
            >
              <span
                className={`${styles.amountSelectValue} numeric-text numeric-text--18`}
                dir="ltr"
              >
                {selectedAmountLabel}
              </span>
            </button>
          </div>

          {amountPickerOpen ? (
            <div
              className={styles.amountPickerOverlay}
              role="presentation"
              onClick={() => setAmountPickerOpen(false)}
            >
              <div
                className={styles.amountPickerSheet}
                role="dialog"
                aria-modal="true"
                aria-labelledby="buy-rial-amount-picker-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className={styles.amountPickerHandle} aria-hidden="true" />
                <h2
                  id="buy-rial-amount-picker-title"
                  className={styles.amountPickerTitle}
                >
                  انتخاب مبلغ (ریال)
                </h2>
                <div className={styles.amountPickerListWrap}>
                  <ul
                    ref={amountPickerListRef}
                    className={styles.amountPickerList}
                    role="listbox"
                  >
                    {BUY_RIAL_PRESET_AMOUNTS_RIAL.map((amount) => {
                      const isSelected = selectedAmountRial === String(amount);
                      return (
                        <li key={amount} role="none">
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`${styles.amountPickerOption} ${
                              isSelected ? styles.amountPickerOptionSelected : ""
                            }`}
                            onClick={() => handleAmountPick(amount)}
                          >
                            <span
                              className={`${styles.amountPickerOptionValue} numeric-text numeric-text--16`}
                              dir="ltr"
                            >
                              {formatAmountDisplay(amount)} ریال
                            </span>
                            <span
                              className={`${styles.amountPickerRadio} ${
                                isSelected
                                  ? styles.amountPickerRadioSelected
                                  : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {showAmountListBottomFade ? (
                    <div
                      className={styles.amountPickerListFade}
                      aria-hidden="true"
                    />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
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
