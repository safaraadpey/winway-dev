"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import cancelCardButtonBg from "@/src/assets/logo/cancelCardBotton.png";
import minusButtonImg from "@/src/assets/logo/minusBotton.png";
import plusButtonImg from "@/src/assets/logo/plusBotton.png";
import panelStyles from "@/components/room/gameRoomPanels.module.css";
import type { AutoBuySnapshot } from "@/lib/autoBuy/types";
import {
  formatAutoBuyFundDisplay,
  resolveAutoBuyInPlayCost,
} from "@/lib/autoBuy/formatFundDisplay";

type PanelMode = "purchase" | "cancel";

export type AutoBuyPanelConfig = {
  available: boolean;
  running: boolean;
  snapshot?: AutoBuySnapshot;
  hasReservedCards?: boolean;
  onStart: (params: {
    fundAmount: number;
    cardCount: number;
    profitTarget: number;
    serialBuyEnabled: boolean;
  }) => Promise<void>;
  onStop: () => Promise<void>;
};

interface BuyCardsPanelProps {
  price: number;
  minQuantity?: number;
  maxQuantity?: number;
  maxBuy?: number;
  disabled?: boolean;
  /** Locks auto-buy start/stop separately from manual card purchase. */
  autoBuyDisabled?: boolean;
  requiresPassword?: boolean;
  mode?: PanelMode;
  actionLabel?: string;
  initialQuantity?: number;
  musicEnabled?: boolean;
  onToggleMusic?: () => void;
  showMusicToggle?: boolean;
  onConfirm: (quantity: number, roomPassword?: string) => Promise<void> | void;
  secondaryActionLabel?: string;
  secondaryDisabled?: boolean;
  onSecondaryAction?: () => Promise<void> | void;
  autoBuy?: AutoBuyPanelConfig;
}

function parseNumericInput(value: string): number {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Number(digits);
}

function formatNumericInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return value.toLocaleString("en-US");
}

export default function BuyCardsPanel({
  price,
  minQuantity = 1,
  maxQuantity = 10,
  maxBuy,
  disabled = false,
  autoBuyDisabled,
  requiresPassword = false,
  mode = "purchase",
  actionLabel,
  initialQuantity,
  musicEnabled,
  onToggleMusic,
  showMusicToggle,
  onConfirm,
  secondaryActionLabel,
  secondaryDisabled,
  onSecondaryAction,
  autoBuy,
}: BuyCardsPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoBuySubmitting, setAutoBuySubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [showRoomPassword, setShowRoomPassword] = useState(false);
  const [autoBuyExpanded, setAutoBuyExpanded] = useState(false);
  const [fundAmount, setFundAmount] = useState("");
  const [profitTarget, setProfitTarget] = useState("");
  const [autoCardCount, setAutoCardCount] = useState(1);
  const [quantity, setQuantity] = useState(() => {
    const safeInitial = initialQuantity ?? minQuantity;
    return Math.min(Math.max(safeInitial, minQuantity), maxQuantity);
  });

  const autoBuyRunning = Boolean(autoBuy?.running);
  const autoBuyAvailable = Boolean(autoBuy?.available);

  useEffect(() => {
    setQuantity((prev) => Math.min(Math.max(prev, minQuantity), maxQuantity));
  }, [minQuantity, maxQuantity]);

  useEffect(() => {
    if (autoBuyRunning) {
      setAutoBuyExpanded(true);
    }
  }, [autoBuyRunning]);

  useEffect(() => {
    if (!autoBuy?.snapshot) return;
    if (autoBuyRunning) {
      if (autoBuy.snapshot.cardCount) {
        setAutoCardCount(autoBuy.snapshot.cardCount);
      }
      if (autoBuy.snapshot.fundInitial) {
        setFundAmount(formatNumericInput(autoBuy.snapshot.fundInitial));
      }
      if (autoBuy.snapshot.profitTarget) {
        setProfitTarget(formatNumericInput(autoBuy.snapshot.profitTarget));
      }
    }
  }, [
    autoBuy?.snapshot?.cardCount,
    autoBuy?.snapshot?.fundInitial,
    autoBuy?.snapshot?.profitTarget,
    autoBuyRunning,
    autoBuy?.snapshot,
  ]);

  const isCancelMode = mode === "cancel";
  const showPasswordField = requiresPassword && !isCancelMode;

  const handleDecrease = () => {
    if (quantity > minQuantity && !isCancelMode) {
      setQuantity(quantity - 1);
    }
  };

  const handleIncrease = () => {
    if (quantity < maxQuantity && !isCancelMode) {
      setQuantity(quantity + 1);
    }
  };

  const executeConfirm = async () => {
    if (disabled || isSubmitting) return;
    if (showPasswordField && !roomPassword.trim()) return;
    try {
      setIsSubmitting(true);
      await onConfirm(
        quantity,
        showPasswordField ? roomPassword.trim() : undefined
      );
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmClick = () => {
    if (disabled || isSubmitting) return;
    if (showPasswordField && !roomPassword.trim()) return;
    if (isCancelMode) {
      void executeConfirm();
      return;
    }
    setShowConfirmModal(true);
  };

  const fundNumeric = parseNumericInput(fundAmount);
  const profitNumeric = parseNumericInput(profitTarget);
  const roundCost = price * autoCardCount;

  const autoBuyLocked = autoBuyDisabled ?? disabled;

  const autoBuyPnlDisplay = useMemo(() => {
    if (
      !autoBuyRunning ||
      autoBuy?.snapshot?.fundInitial == null ||
      autoBuy?.snapshot?.fundRemaining == null
    ) {
      return null;
    }
    const inPlayCost = resolveAutoBuyInPlayCost({
      inPlayCost: autoBuy.snapshot.inPlayCost,
      hasReservedCards: autoBuy.hasReservedCards,
      lastRoomId: autoBuy.snapshot.lastRoomId,
      price,
      cardCount: autoBuy.snapshot.cardCount ?? autoCardCount,
    });
    return formatAutoBuyFundDisplay(
      autoBuy.snapshot.fundInitial,
      autoBuy.snapshot.fundRemaining,
      inPlayCost
    );
  }, [
    autoBuy?.hasReservedCards,
    autoBuy?.snapshot?.cardCount,
    autoBuy?.snapshot?.fundInitial,
    autoBuy?.snapshot?.fundRemaining,
    autoBuy?.snapshot?.inPlayCost,
    autoBuy?.snapshot?.lastRoomId,
    autoBuyRunning,
    autoCardCount,
    price,
  ]);

  const autoBuyFormValid = useMemo(() => {
    return (
      fundNumeric >= roundCost &&
      profitNumeric > 0 &&
      autoCardCount >= 1 &&
      autoCardCount <= maxQuantity
    );
  }, [autoCardCount, fundNumeric, maxQuantity, profitNumeric, roundCost]);

  const handleAutoBuyToggle = () => {
    if (!autoBuyAvailable || autoBuyRunning) return;
    setAutoBuyExpanded((prev) => {
      const next = !prev;
      if (next && !autoBuyRunning && !fundAmount && price > 0) {
        const defaultFund = Math.max(roundCost * 10, price * 10);
        setFundAmount(formatNumericInput(defaultFund));
      }
      if (next && !autoBuyRunning && !profitTarget && price > 0) {
        const defaultFund = Math.max(roundCost * 10, price * 10);
        setProfitTarget(formatNumericInput(Math.max(1, Math.round(defaultFund * 0.25))));
      }
      return next;
    });
  };

  const handleAutoCardDecrease = () => {
    if (autoBuyRunning) return;
    setAutoCardCount((prev) => Math.max(1, prev - 1));
  };

  const handleAutoCardIncrease = () => {
    if (autoBuyRunning) return;
    setAutoCardCount((prev) => Math.min(maxQuantity, prev + 1));
  };

  const handleAutoBuyAction = async () => {
    if (!autoBuy || autoBuySubmitting) return;

    if (autoBuyRunning) {
      try {
        setAutoBuySubmitting(true);
        await autoBuy.onStop();
        setAutoBuyExpanded(false);
      } finally {
        setAutoBuySubmitting(false);
      }
      return;
    }

    if (!autoBuyFormValid) return;

    try {
      setAutoBuySubmitting(true);
      await autoBuy.onStart({
        fundAmount: fundNumeric,
        cardCount: autoCardCount,
        profitTarget: profitNumeric,
        serialBuyEnabled: false,
      });
    } finally {
      setAutoBuySubmitting(false);
    }
  };

  const totalPrice = quantity * price;
  const controlsDisabled = disabled || isCancelMode;
  const purchaseButtonStyle = !isCancelMode
    ? {
        backgroundImage: `url(${buyCardButtonBg.src})`,
      }
    : undefined;
  const ctaLabel = isCancelMode
    ? actionLabel || "لغو رزرو"
    : `تایید ${totalPrice.toLocaleString("en-US")} تومن`;

  const hasSecondary = Boolean(onSecondaryAction && secondaryActionLabel);
  const maxDisplay = maxBuy ?? maxQuantity;
  const passwordMissing = showPasswordField && !roomPassword.trim();
  const buttonDisabled = disabled || isSubmitting || passwordMissing;

  const showAutoBuySection =
    autoBuyAvailable && (autoBuyExpanded || autoBuyRunning);

  return (
    <div
      className={`${panelStyles.panelSurface} ${
        showAutoBuySection ? panelStyles.panelSurfaceAutoBuyOpen : ""
      } rounded-2xl p-3 space-y-3`}
      data-tour-id="game-room-buy-panel"
    >
      <div className={panelStyles.buyPanelTopRow}>
        <div className={panelStyles.buyPanelControls}>
          {(showMusicToggle || onToggleMusic) && (
            <button
              type="button"
              onClick={onToggleMusic}
              aria-label={`موسیقی ${musicEnabled ? "روشن" : "خاموش"}`}
              disabled={!onToggleMusic}
              className={panelStyles.musicButton}
            >
              <span className="text-lg">{musicEnabled ? "🔊" : "🔇"}</span>
            </button>
          )}
        </div>

        <div className={panelStyles.buyPanelTopRight}>
          {showPasswordField && (
            <div className={panelStyles.roomPasswordWrapper}>
              <input
                type={showRoomPassword ? "text" : "password"}
                value={roomPassword}
                onChange={(event) => setRoomPassword(event.target.value)}
                placeholder="رمز اتاق"
                autoComplete="off"
                dir="ltr"
                className={panelStyles.roomPasswordInput}
                aria-label="رمز اتاق"
                disabled={disabled || isSubmitting}
              />
              <button
                type="button"
                className={panelStyles.roomPasswordToggle}
                onClick={() => setShowRoomPassword((prev) => !prev)}
                aria-label={showRoomPassword ? "مخفی کردن رمز" : "نمایش رمز"}
                disabled={disabled || isSubmitting}
              >
                {showRoomPassword ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          )}

          {autoBuyAvailable && (
            <button
              type="button"
              className={`${panelStyles.autoBuyToggle} ${
                autoBuyExpanded || autoBuyRunning ? panelStyles.autoBuyToggleActive : ""
              }`}
              onClick={handleAutoBuyToggle}
              disabled={autoBuyRunning}
              aria-pressed={autoBuyExpanded || autoBuyRunning}
              data-tour-id="game-room-auto-buy-toggle"
            >
              <span className={panelStyles.autoBuyToggleLabel}>خرید اتوماتیک</span>
              <span className={panelStyles.autoBuyToggleIcon} aria-hidden="true">
                {autoBuyRunning ? "●" : autoBuyExpanded ? "▾" : "▸"}
              </span>
            </button>
          )}

          <div className={panelStyles.quantityBadge}>
            <span className={panelStyles.quantityBadgeLabel}>تعداد کارت</span>
            <span className={panelStyles.quantityBadgeValue} dir="ltr">
              {`${quantity}/${maxDisplay}`}
            </span>
          </div>
        </div>
      </div>

      {!showAutoBuySection && (
      <div className={panelStyles.buyPanelActionRow}>
        {!isCancelMode && (
          <button
            type="button"
            onClick={handleDecrease}
            disabled={quantity <= minQuantity || controlsDisabled}
            aria-label="کاهش"
            className={panelStyles.stepperButton}
          >
            <Image src={minusButtonImg} alt="" width={48} height={48} priority={false} />
          </button>
        )}

        <button
          type="button"
          onClick={handleConfirmClick}
          disabled={buttonDisabled}
          className={
            isCancelMode ? panelStyles.confirmButtonCancel : panelStyles.confirmButton
          }
          style={purchaseButtonStyle}
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              در حال پردازش...
            </span>
          ) : (
            ctaLabel
          )}
        </button>

        {!isCancelMode && (
          <button
            type="button"
            onClick={handleIncrease}
            disabled={quantity >= maxQuantity || controlsDisabled}
            aria-label="افزایش"
            className={panelStyles.stepperButton}
          >
            <Image src={plusButtonImg} alt="" width={48} height={48} priority={false} />
          </button>
        )}
      </div>
      )}

      {showAutoBuySection && autoBuy && (
        <div className={panelStyles.autoBuySection} data-tour-id="game-room-auto-buy-panel">
          <div className={panelStyles.autoBuyFieldRow}>
            <span className={panelStyles.autoBuyFieldLabel}>سقف خرید</span>
            <div className={panelStyles.autoBuyFieldControl}>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={panelStyles.autoBuyNumericInput}
                placeholder="500,000"
                value={fundAmount}
                onChange={(event) =>
                  setFundAmount(formatNumericInput(parseNumericInput(event.target.value)))
                }
                disabled={autoBuyRunning || autoBuySubmitting}
                aria-label="مبلغ سقف خرید"
              />
              <span className="text-xs text-white/70">تومن</span>
            </div>
          </div>

          <div className={panelStyles.autoBuyFieldRow}>
            <span className={panelStyles.autoBuyFieldLabel}>سقف برد</span>
            <div className={panelStyles.autoBuyFieldControl}>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                className={panelStyles.autoBuyNumericInput}
                placeholder="25,000"
                value={profitTarget}
                onChange={(event) =>
                  setProfitTarget(formatNumericInput(parseNumericInput(event.target.value)))
                }
                disabled={autoBuyRunning || autoBuySubmitting}
                aria-label="مبلغ سقف برد"
              />
              <span className="text-xs text-white/70">تومن</span>
            </div>
          </div>

          <div className={panelStyles.autoBuyFieldRow}>
            <span className={panelStyles.autoBuyFieldLabel}>تعداد کارت در هر نوبت بازی</span>
            <div className={panelStyles.autoBuyFieldControl}>
              <button
                type="button"
                className={panelStyles.autoBuyStepperButton}
                onClick={handleAutoCardDecrease}
                disabled={autoBuyRunning || autoBuySubmitting || autoCardCount <= 1}
                aria-label="کاهش تعداد کارت اتوماتیک"
              >
                −
              </button>
              <span className={panelStyles.autoBuyCardCountValue} dir="ltr">
                {autoCardCount}
              </span>
              <button
                type="button"
                className={panelStyles.autoBuyStepperButton}
                onClick={handleAutoCardIncrease}
                disabled={
                  autoBuyRunning || autoBuySubmitting || autoCardCount >= maxQuantity
                }
                aria-label="افزایش تعداد کارت اتوماتیک"
              >
                +
              </button>
            </div>
          </div>

          {autoBuyRunning && autoBuyPnlDisplay && (
            <p className={panelStyles.autoBuyStatusLine}>
              سود و زیان:{" "}
              <span
                className={`${panelStyles.autoBuyStatusValue} ${
                  autoBuyPnlDisplay.tone === "gain"
                    ? panelStyles.autoBuyStatusValueGain
                    : panelStyles.autoBuyStatusValueLoss
                }`}
                dir="ltr"
              >
                {autoBuyPnlDisplay.value}
              </span>
            </p>
          )}

          {!autoBuyRunning && autoBuy.hasReservedCards && (
            <p className={panelStyles.autoBuyStatusLine}>
              با شروع، از بازی بعد برای همین سایز اتاق خرید خودکار انجام می‌شود.
            </p>
          )}

          {!autoBuyRunning && !autoBuyFormValid && (
            <p className={panelStyles.autoBuyStatusLine}>
              سقف خرید حداقل{" "}
              <span className={panelStyles.autoBuyStatusValue} dir="ltr">
                {roundCost.toLocaleString("en-US")}
              </span>{" "}
              تومن (یک دور) و سقف برد باید بیشتر از صفر باشد.
            </p>
          )}

          {!autoBuyRunning && (
            <p className={panelStyles.autoBuyStatusLine}>
              با خروج از حساب هم بازی در سرور ادامه پیدا می‌کند تا توقف بزنید یا صندوق
              تمام شود. در صورت رسیدن به سود مورد نظر دستیار متوقف می‌شود.
            </p>
          )}

          <button
            type="button"
            className={
              autoBuyRunning
                ? panelStyles.autoBuyStopButton
                : panelStyles.autoBuyStartButton
            }
            style={
              autoBuyRunning
                ? undefined
                : {
                    backgroundImage: `url(${buyCardButtonBg.src})`,
                  }
            }
            onClick={() => void handleAutoBuyAction()}
            disabled={
              autoBuySubmitting ||
              autoBuyLocked ||
              (!autoBuyRunning && !autoBuyFormValid)
            }
          >
            {autoBuySubmitting
              ? "در حال پردازش..."
              : autoBuyRunning
                ? "توقف"
                : "شروع"}
          </button>
        </div>
      )}

      {hasSecondary && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void onSecondaryAction?.()}
            disabled={secondaryDisabled}
            className={`${panelStyles.confirmButtonCancel} ${panelStyles.confirmButtonHalf}`}
          >
            {secondaryActionLabel}
          </button>
        </div>
      )}

      {showConfirmModal && !isCancelMode && (
        <div className={panelStyles.confirmModalOverlay}>
          <div className={`${panelStyles.panelSurface} ${panelStyles.confirmModal}`}>
            <div className={panelStyles.confirmModalTitle}>تایید خرید کارت</div>
            <div className={panelStyles.confirmModalBody}>از خرید خود مطمئنید؟</div>
            <div className={panelStyles.confirmModalActions}>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className={panelStyles.confirmModalSecondaryButton}
                style={{
                  backgroundImage: `url(${cancelCardButtonBg.src})`,
                }}
              >
                خیر لغو میکنم
              </button>
              <button
                type="button"
                onClick={() => void executeConfirm()}
                disabled={isSubmitting}
                className={panelStyles.confirmModalPrimaryButton}
                style={{
                  backgroundImage: `url(${buyCardButtonBg.src})`,
                }}
              >
                {isSubmitting ? "در حال ثبت..." : "بله ادامه میدم"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
