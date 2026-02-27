"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import ticktBuyBg from "@/src/assets/logo/TicktBuy_BG.png";
import buyCardButtonBg from "@/src/assets/logo/BuyCardBotton.png";
import cancelCardButtonBg from "@/src/assets/logo/cancelCardBotton.png";
import minusButtonImg from "@/src/assets/logo/minusBotton.png";
import plusButtonImg from "@/src/assets/logo/plusBotton.png";

type PanelMode = "purchase" | "cancel";

interface BuyCardsPanelProps {
  price: number;
  minQuantity?: number;
  maxQuantity?: number;
  maxBuy?: number;
  disabled?: boolean;
  mode?: PanelMode;
  actionLabel?: string;
  initialQuantity?: number;
  musicEnabled?: boolean;
  onToggleMusic?: () => void;
  showMusicToggle?: boolean;
  onConfirm: (quantity: number) => Promise<void> | void;
  secondaryActionLabel?: string;
  secondaryDisabled?: boolean;
  onSecondaryAction?: () => Promise<void> | void;
}

export default function BuyCardsPanel({
  price,
  minQuantity = 1,
  maxQuantity = 10,
  maxBuy,
  disabled = false,
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
}: BuyCardsPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
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

  const executeConfirm = async () => {
    if (disabled || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onConfirm(quantity);
      setShowConfirmModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmClick = () => {
    if (disabled || isSubmitting) return;
    if (isCancelMode) {
      void executeConfirm();
      return;
    }
    setShowConfirmModal(true);
  };

  const totalPrice = quantity * price;
  const controlsDisabled = disabled || isCancelMode;
  const buttonDisabled = disabled || isSubmitting;
  const buttonClass = isCancelMode
    ? "w-full py-4 rounded-xl bg-red-600 text-white font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform"
    : "w-full py-4 rounded-xl bg-transparent text-[#006400] font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform";
  const purchaseButtonStyle = !isCancelMode
    ? {
        backgroundImage: `url(${buyCardButtonBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
      }
    : undefined;
  const ctaLabel = isCancelMode
    ? actionLabel || "لغو رزرو"
    : `تایید ${totalPrice.toLocaleString("en-US")} تومن`;

  const hasSecondary = Boolean(onSecondaryAction && secondaryActionLabel);

  return (
    <div
      className="border border-transparent rounded-2xl p-3 space-y-4"
      style={{
        backgroundImage: `url(${ticktBuyBg.src})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
        backgroundColor: "#151A26",
      }}
    >
        <div className="flex items-center justify-between gap-0.5">
          <div className="flex items-center gap-2">
            {(showMusicToggle || onToggleMusic) && (
              <button
                type="button"
                onClick={onToggleMusic}
                aria-label={`موسیقی ${musicEnabled ? "روشن" : "خاموش"}`}
                disabled={!onToggleMusic}
                className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-1.5 py-1 text-white bg-black/40 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="text-lg">{musicEnabled ? "🔊" : "🔇"}</span>
              </button>
            )}

          <div className="inline-flex flex-col items-center rounded-full border border-gray-600 px-3 py-1 text-white">
            <span className="text-xs leading-tight">تعداد خرید</span>
            <span className="text-base font-semibold">
              {`${minQuantity} ~ ${maxBuy ?? maxQuantity}`}
            </span>
          </div>
        </div>

        <div className="bg-[#111111]/60 rounded-full px-1 py-1 flex items-center justify-center gap-4 border border-gray-600">
          <button
            onClick={handleDecrease}
            disabled={quantity <= minQuantity || controlsDisabled}
            aria-label="کاهش"
            className="w-12 h-12 rounded-full bg-transparent p-0 flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform overflow-hidden"
          >
            <Image src={minusButtonImg} alt="" width={48} height={48} priority={false} />
          </button>

          <span className="text-white text-3xl font-semibold min-w-[60px] text-center">
            {quantity}
          </span>

          <button
            onClick={handleIncrease}
            disabled={quantity >= maxQuantity || controlsDisabled}
            aria-label="افزایش"
            className="w-12 h-12 rounded-full bg-transparent p-0 flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform overflow-hidden"
          >
            <Image src={plusButtonImg} alt="" width={48} height={48} priority={false} />
          </button>
        </div>
      </div>

      <div className={hasSecondary ? "flex gap-2" : ""}>
        <button
          onClick={handleConfirmClick}
          disabled={buttonDisabled}
          className={`${buttonClass} ${hasSecondary ? "flex-1" : ""}`}
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

        {hasSecondary && (
          <button
            onClick={() => void onSecondaryAction?.()}
            disabled={secondaryDisabled}
            className="flex-1 w-full py-4 rounded-xl bg-red-600 text-white font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>

      {showConfirmModal && !isCancelMode && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4">
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-700 p-4 text-white"
            style={{
              backgroundImage: `url(${ticktBuyBg.src})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "100% 100%",
              backgroundColor: "#151A26",
            }}
          >
            <div className="mb-2 text-center text-xl font-bold">تایید خرید کارت</div>
            <div className="mb-4 text-center text-base text-gray-200 leading-7">
              آیا از خرید {quantity.toLocaleString("en-US")} کارت به مبلغ{" "}
              {totalPrice.toLocaleString("en-US")} تومن مطمئن هستید؟
              <div className="mt-1 text-center text-[11px] text-red-300">
                بعد از خرید امکان لغو وجود ندارد.
              </div>
              <div className="mt-2 text-center text-sm text-gray-300">
                بعد از خرید، اگر نام شما در لیست بازیکن‌ها نمایش داده نشد کمی صبر کنید یا صفحه را رفرش کنید.
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-transparent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                style={{
                  backgroundImage: `url(${cancelCardButtonBg.src})`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  backgroundSize: "100% 100%",
                }}
              >
                لغو
              </button>
              <button
                type="button"
                onClick={() => void executeConfirm()}
                disabled={isSubmitting}
                className="flex-1 rounded-xl bg-transparent px-3 py-2 text-sm font-semibold text-[#006400] disabled:opacity-50"
                style={{
                  backgroundImage: `url(${buyCardButtonBg.src})`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "center",
                  backgroundSize: "100% 100%",
                }}
              >
                {isSubmitting ? "در حال ثبت..." : "تایید نهایی"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
