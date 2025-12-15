"use client";

import React from 'react';

interface QuantitySelectorProps {
  value: number;
  min?: number;
  max?: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

/**
 * کامپوننت انتخاب تعداد کارت با دکمه‌های + و -
 */
export default function QuantitySelector({ 
  value, 
  min = 1, 
  max = 10,
  onDecrease, 
  onIncrease 
}: QuantitySelectorProps) {
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <div className="flex items-center gap-6">
      {/* دکمه کاهش */}
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        className={`
          w-10 h-10 rounded-full flex items-center justify-center
          transition-all duration-200
          ${canDecrease 
            ? 'bg-red-500 hover:bg-red-600 active:bg-red-700 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.6)] hover:shadow-[0_0_25px_rgba(239,68,68,0.8)]' 
            : 'bg-gray-300 cursor-not-allowed opacity-50'
          }
        `}
        aria-label="کاهش تعداد"
      >
        <svg 
          className="w-5 h-5 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={3} 
            d="M20 12H4" 
          />
        </svg>
      </button>

      {/* نمایش مقدار */}
      <div className="w-16 h-16 rounded-full border-2 border-red-500 bg-white flex items-center justify-center">
        <span className="text-red-500 font-bold text-2xl">{value}</span>
      </div>

      {/* دکمه افزایش */}
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        className={`
          w-10 h-10 rounded-full flex items-center justify-center
          transition-all duration-200
          ${canIncrease 
            ? 'bg-green-500 hover:bg-green-600 active:bg-green-700 cursor-pointer shadow-[0_0_15px_rgba(34,197,94,0.6)] hover:shadow-[0_0_25px_rgba(34,197,94,0.8)]' 
            : 'bg-gray-300 cursor-not-allowed opacity-50'
          }
        `}
        aria-label="افزایش تعداد"
      >
        <svg 
          className="w-5 h-5 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={3} 
            d="M12 4v16m8-8H4" 
          />
        </svg>
      </button>
    </div>
  );
}

