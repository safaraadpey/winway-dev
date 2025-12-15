"use client";

import React from 'react';

interface PriceLabelProps {
  price: number;
  currency?: string;
}

/**
 * کامپوننت نمایش قیمت
 */
export default function PriceLabel({ price, currency = 'تومن' }: PriceLabelProps) {
  const formatPrice = (amount: number): string => {
    return amount.toLocaleString('fa-IR');
  };

  return (
    <div className="text-gray-700 text-xl font-bold">
      {formatPrice(price)} {currency}
    </div>
  );
}

