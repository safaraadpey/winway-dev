"use client";

import React from 'react';

interface ActiveCardRowProps {
  title: string;
  count: number;
}

/**
 * ردیف نمایش کارت فعال
 */
export default function ActiveCardRow({ title, count }: ActiveCardRowProps) {
  return (
    <div className="bg-white rounded-lg px-3 py-1.5 flex items-center justify-between">
      <span className="text-gray-800 text-sm font-medium">{title}</span>
      <span className="text-gray-600 text-sm">{count} برگ</span>
    </div>
  );
}

