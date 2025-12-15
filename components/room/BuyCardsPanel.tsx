"use client";

import React, { useEffect, useState } from "react";

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
  onConfirm: (quantity: number) => Promise<void> | void;
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
  onConfirm,
}: BuyCardsPanelProps) {
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
  const buttonDisabled = disabled || isSubmitting;
  const buttonClass = isCancelMode
    ? "w-full py-4 rounded-xl bg-red-600 text-white font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform"
    : "w-full py-4 rounded-xl bg-[#32cd32] text-[#006400] font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform";
  const ctaLabel = isCancelMode
    ? actionLabel || "لغو رزرو"
    : `تایید ${totalPrice.toLocaleString("en-US")} تومن`;

  return (
    <div className="bg-[#151A26] border border-[rgba(95,89,89,1)] rounded-2xl p-3 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex flex-col items-center rounded-full border border-gray-600 px-3 py-1 text-white">
          <span className="text-xs leading-tight">حداکثر خرید</span>
          <span className="text-base font-semibold">
            {maxBuy ?? maxQuantity}
          </span>
        </div>

        <div className="bg-[#111111] rounded-full px-1 py-1 flex items-center justify-center gap-4 border border-gray-600">
          <button
            onClick={handleDecrease}
            disabled={quantity <= minQuantity || controlsDisabled}
            className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <span className="text-white text-3xl font-semibold min-w-[60px] text-center">
            {quantity}
          </span>

          <button
            onClick={handleIncrease}
            disabled={quantity >= maxQuantity || controlsDisabled}
            className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <button onClick={handleConfirm} disabled={buttonDisabled} className={buttonClass}>
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
    </div>
  );
}
