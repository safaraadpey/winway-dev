"use client";

import React from 'react';

interface AddToListButtonProps {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}

/**
 * دکمه افزودن به لیست بازیکنان
 */
export default function AddToListButton({ 
  onClick, 
  disabled = false,
  loading = false 
}: AddToListButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        w-full bg-green-500 text-white py-3 px-4 rounded-lg
        font-semibold text-base
        flex items-center justify-center gap-2
        transition-all duration-200
        ${disabled || loading
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:bg-green-600 active:bg-green-700 cursor-pointer shadow-[0_0_15px_rgba(34,197,94,0.6)] hover:shadow-[0_0_25px_rgba(34,197,94,0.8)]'
        }
      `}
    >
      {loading ? (
        <>
          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>در حال پردازش...</span>
        </>
      ) : (
        <>
          <svg 
            className="w-5 h-5 text-black" 
            fill="currentColor" 
            viewBox="0 0 24 24"
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
          <span>افزودن به لیست بازیکنها</span>
          <svg 
            className="w-5 h-5 text-black" 
            fill="currentColor" 
            viewBox="0 0 24 24"
          >
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </>
      )}
    </button>
  );
}

