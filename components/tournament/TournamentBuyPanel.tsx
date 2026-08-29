"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import minusButtonImg from "@/src/assets/logo/minusBotton.png";
import plusButtonImg from "@/src/assets/logo/plusBotton.png";
import panelStyles from "@/components/room/gameRoomPanels.module.css";

type PanelMode = "purchase" | "cancel";

interface TournamentBuyPanelProps {
  price: number;
  minQuantity?: number;
  maxQuantity?: number;
  maxBuy?: number;
  displayMin?: number;
  displayMax?: number;
  disabled?: boolean;
  /** فقط دکمه تأیید/خرید را غیرفعال می‌کند؛ stepper همچنان فعال می‌ماند */
  confirmDisabled?: boolean;
  mode?: PanelMode;
  actionLabel?: string;
  initialQuantity?: number;
  currencyLabel?: string;
  musicEnabled?: boolean;
  onToggleMusic?: () => void;
  showMusicToggle?: boolean;
  onConfirm: (quantity: number) => Promise<void> | void;
  /** جایگزین دکمه تأیید/خرید — مثلاً CTA ثبت‌نام مهمان */
  confirmSlot?: React.ReactNode;
  secondaryActionLabel?: string;
  secondaryDisabled?: boolean;
  onSecondaryAction?: () => Promise<void> | void;
}

export default function TournamentBuyPanel({
  price,
  minQuantity = 1,
  maxQuantity = 10,
  maxBuy,
  displayMin,
  displayMax,
  disabled = false,
  confirmDisabled = false,
  mode = "purchase",
  actionLabel,
  initialQuantity,
  currencyLabel = "تومن",
  musicEnabled,
  onToggleMusic,
  showMusicToggle,
  onConfirm,
  confirmSlot,
  secondaryActionLabel,
  secondaryDisabled,
  onSecondaryAction,
}: TournamentBuyPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantity, setQuantity] = useState(() => {
    const safeInitial = initialQuantity ?? minQuantity;
    return Math.min(Math.max(safeInitial, minQuantity), maxQuantity);
  });

  useEffect(() => {
    setQuantity((prev) => Math.min(Math.max(prev, minQuantity), maxQuantity));
  }, [minQuantity, maxQuantity]);

  const isCancelMode = mode === "cancel";

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

  const handleConfirm = async () => {
    if (disabled || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onConfirm(quantity);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPrice = quantity * price;
  const controlsDisabled = disabled || isCancelMode;
  const buttonDisabled = disabled || confirmDisabled || isSubmitting;
  const ctaLabel = isCancelMode
    ? actionLabel || "لغو رزرو"
    : `تایید ${totalPrice.toLocaleString("en-US")} ${currencyLabel}`;

  const hasSecondary = Boolean(onSecondaryAction && secondaryActionLabel);

  return (
    <div className={`${panelStyles.panelSurface} rounded-2xl p-3 space-y-4`}>
      <div className={panelStyles.tournamentBuyTopRow}>
        <div className={panelStyles.tournamentBuyControls}>
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

          <div className={panelStyles.tournamentRangeBadge}>
            <span className={panelStyles.tournamentRangeBadgeLabel}>تعداد خرید</span>
            <span className={panelStyles.tournamentRangeBadgeValue}>
              {`${displayMin ?? minQuantity} ~ ${displayMax ?? maxBuy ?? maxQuantity}`}
            </span>
          </div>
        </div>

        <div className={panelStyles.tournamentStepperGroup}>
          <button
            type="button"
            onClick={handleDecrease}
            disabled={quantity <= minQuantity || controlsDisabled}
            aria-label="کاهش"
            className={panelStyles.stepperButton}
          >
            <Image src={minusButtonImg} alt="" width={48} height={48} priority={false} />
          </button>

          <span className={panelStyles.tournamentQuantity}>{quantity}</span>

          <button
            type="button"
            onClick={handleIncrease}
            disabled={quantity >= maxQuantity || controlsDisabled}
            aria-label="افزایش"
            className={panelStyles.stepperButton}
          >
            <Image src={plusButtonImg} alt="" width={48} height={48} priority={false} />
          </button>
        </div>
      </div>

      <div className={hasSecondary ? panelStyles.tournamentActionsRow : undefined}>
        {confirmSlot ?? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={buttonDisabled}
            className={
              isCancelMode
                ? panelStyles.tournamentCancelButton
                : panelStyles.tournamentConfirmButton
            }
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
        )}

        {hasSecondary && (
          <button
            type="button"
            onClick={() => void onSecondaryAction?.()}
            disabled={secondaryDisabled}
            className={panelStyles.tournamentCancelButton}
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
