"use client";

import React from 'react';

type PanelMode = "purchase" | "cancel";

interface CardQuantityPanelProps {
  quantity: number;
  price: number;
  minQuantity?: number;
  maxQuantity?: number;
  onQuantityChange: (newQuantity: number) => void;
  onAddToList: () => void;
  loading?: boolean;
  disabled?: boolean;
  mode?: PanelMode;
  actionLabel?: string;
}

/**
 * پنل انتخاب تعداد کارت و افزودن به لیست
 * طراحی جدید طبق تصویر: selector تعداد در بالا و دکمه تایید در پایین
 */
export default function CardQuantityPanel({
  quantity,
  price,
  minQuantity = 1,
  maxQuantity = 10,
  onQuantityChange,
  onAddToList,
  loading = false,
  disabled = false,
  mode = "purchase",
  actionLabel,
}: CardQuantityPanelProps) {
  const isCancelMode = mode === "cancel";

  const handleDecrease = () => {
    if (quantity > minQuantity && !isCancelMode) {
      onQuantityChange(quantity - 1);
    }
  };

  const handleIncrease = () => {
    if (quantity < maxQuantity && !isCancelMode) {
      onQuantityChange(quantity + 1);
    }
  };

  const totalPrice = quantity * price;
  const controlsDisabled = disabled || isCancelMode;
  const buttonDisabled = disabled || loading;
  const buttonClass =
    isCancelMode
      ? "w-full py-4 rounded-xl bg-red-600 text-white font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform"
      : "w-full py-4 rounded-xl bg-[#32cd32] text-[#006400] font-bold text-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 transition-transform";
  const ctaLabel = isCancelMode
    ? actionLabel || "لغو رزرو"
    : `تایید ${totalPrice.toLocaleString("en-US")} تومن`;

  return (
    <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
      {/* بخش بالایی: Selector تعداد */}
      <div className="flex items-center justify-between gap-3">
        {/* دکمه کاهش */}
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

        {/* متن "کارت" */}
        <span className="text-white text-sm font-medium">کارت</span>

        {/* نمایش تعداد در وسط */}
        <div className="w-16 h-16 rounded-full border-4 border-red-500 bg-[#f5f5dc] flex items-center justify-center shadow-lg">
          <span className="text-red-500 text-2xl font-bold">{quantity}</span>
        </div>

        {/* متن "تعداد" */}
        <span className="text-white text-sm font-medium">تعداد</span>

        {/* دکمه افزایش */}
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

      {/* بخش پایینی: دکمه تایید */}
      <button onClick={onAddToList} disabled={buttonDisabled} className={buttonClass}>
        {loading ? (
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
