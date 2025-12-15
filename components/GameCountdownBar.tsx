"use client";

import React from 'react';

interface GameCountdownBarProps {
  secondsRemaining: number;
}

/**
 * کامپوننت نمایش شمارش معکوس تا شروع بازی
 */
export default function GameCountdownBar({ secondsRemaining }: GameCountdownBarProps) {
  const formatTime = (seconds: number): string => {
    return seconds.toString();
  };

  return (
    <div className="flex items-center justify-between bg-gray-100 px-4 py-3 rounded-lg">
      <span className="text-gray-700 text-sm">ثانیه تا شروع بازی</span>
      <div className="flex items-center gap-2">
        <span className="text-red-600 font-bold text-lg">{formatTime(secondsRemaining)}</span>
        <svg 
          className="w-5 h-5 text-white" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
          />
        </svg>
      </div>
    </div>
  );
}

