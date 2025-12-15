"use client";

import { useState, useEffect } from 'react';
import BingoCardDemo from '@/components/BingoCardDemo';
import DingHeader from '@/components/DingHeader';
import { DingProvider } from '@/contexts/DingContext';
import { checkFullCardBingo } from '@/lib/bingo-logic';
import { flattenCardNumbers } from "@/lib/live-room-helper";

/**
 * صفحه تست ساده برای نمایش کامپوننت BingoCard
 * 
 * دسترسی: /test-bingo
 */
export default function TestBingoPage() {
  // کارت ثابت برای تست UI
  // این کارت مستقل از بک‌اند است
  const cardData: (number | null)[][] = [
    [2, 19, 22, 36, null, null, null, 73, null],
    [null, null, 26, null, 48, 58, 61, null, 85],
    [8, null, null, 34, 43, null, 70, null, 87]
  ];

  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [isWinner, setIsWinner] = useState(false);
  const [autoCall, setAutoCall] = useState(false);
  const [linePrize, setLinePrize] = useState(false);

  // استخراج اعداد کارت برای نمایش
  const cardNumbers = flattenCardNumbers(cardData);

  // بررسی برنده شدن (Full Card Bingo)
  useEffect(() => {
    if (calledNumbers.length === 0) {
      setIsWinner(false);
      return;
    }

    const isFullCard = checkFullCardBingo(cardData, calledNumbers);
    if (isFullCard && !isWinner) {
      setTimeout(() => {
        setIsWinner(true);
      }, 500);
    } else if (!isFullCard && isWinner) {
      setIsWinner(false);
    }
  }, [calledNumbers, cardData, isWinner]);

  // شبیه‌سازی اعلام خودکار اعداد
  useEffect(() => {
    if (!autoCall || calledNumbers.length >= 90) return;

    const interval = setInterval(() => {
      // انتخاب عدد تصادفی بین 1 تا 90
      let nextNumber: number;
      do {
        nextNumber = Math.floor(Math.random() * 90) + 1;
      } while (calledNumbers.includes(nextNumber));

      setCalledNumbers((prev) => [...prev, nextNumber]);
    }, 2000); // هر 2 ثانیه یک عدد

    return () => clearInterval(interval);
  }, [autoCall, calledNumbers]);

  const handleReset = () => {
    setCalledNumbers([]);
    setIsWinner(false);
    setAutoCall(false);
  };

  const handleCallNumber = (number: number) => {
    if (!calledNumbers.includes(number)) {
      setCalledNumbers((prev) => [...prev, number]);
    }
  };

  cardNumbers.sort((a: number, b: number) => a - b);

  return (
    <DingProvider initialBalance={1000}>
      <div className="min-h-screen bg-gray-100">
        <div className="p-4">
        <div className="max-w-4xl mx-auto">
          {/* هدر تست */}
          <h1 className="text-3xl font-bold mb-6 text-center">تست کامپوننت BingoCard</h1>

          {/* DingHeader */}
          <div className="mb-3">
            <DingHeader dingBalance={1000} />
          </div>

          {/* نمایش کارت‌ها */}
          <div className="space-y-3">
            {/* کارت خود بازیکن */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">کارت من (isMyCard={true})</h2>
              
              <div className="w-full -mx-6 -mb-6">
                <BingoCardDemo
                  calledNumbers={calledNumbers}
                  isWinner={isWinner}
                  playerName="safa1234"
                  cardNumber={85}
                  size="large"
                  isMyCard={true}
                  linePrize={linePrize}
                  onNumberCalled={(number) => {
                    console.log('Number called in my card:', number);
                  }}
                />
              </div>
            </div>

            {/* کارت بازیکن دیگر */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">کارت بازیکن دیگر (isMyCard={false})</h2>
              
              <div className="w-full -mx-6 -mb-6">
                <BingoCardDemo
                  calledNumbers={calledNumbers}
                  isWinner={isWinner}
                  playerName="player2"
                  cardNumber={42}
                  size="large"
                  isMyCard={false}
                  linePrize={linePrize}
                  onNumberCalled={(number) => {
                    console.log('Number called in other card:', number);
                  }}
                />
              </div>
            </div>
          </div>

        {/* کنترل‌ها */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-3 mt-3">
          <h2 className="text-xl font-semibold mb-4">کنترل‌ها</h2>
          
          <div className="flex flex-wrap gap-4 items-center">
            <button
              onClick={() => setAutoCall(!autoCall)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                autoCall
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {autoCall ? '⏸ توقف' : '▶ شروع اعلام خودکار'}
            </button>

            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-gray-500 text-white hover:bg-gray-600 transition"
            >
              🔄 Reset
            </button>

            <button
              onClick={() => setIsWinner(!isWinner)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                isWinner
                  ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isWinner ? '❌ غیرفعال کردن BINGO' : '🎉 تست BINGO'}
            </button>

            <button
              onClick={() => setLinePrize(!linePrize)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                linePrize
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-gray-400 text-white hover:bg-gray-500'
              }`}
            >
              {linePrize ? '✨ جایزه خط: فعال' : '⚪ جایزه خط: غیرفعال'}
            </button>

            <div className="ml-auto text-sm text-gray-600">
              اعداد اعلام شده: <span className="font-bold">{calledNumbers.length}</span>
            </div>
          </div>

          {/* اعداد موجود در کارت */}
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-2">
              اعداد موجود در این کارت ({cardNumbers.length} عدد):
            </p>
            <div className="flex flex-wrap gap-2">
              {cardNumbers.map((num: number) => (
                <button
                  key={num}
                  onClick={() => handleCallNumber(num)}
                  disabled={calledNumbers.includes(num)}
                  className={`px-3 py-1 rounded text-sm font-medium transition ${
                    calledNumbers.includes(num)
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200 cursor-pointer'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* لیست اعداد اعلام شده */}
          {calledNumbers.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 mb-2">
                اعداد اعلام شده ({calledNumbers.length} عدد):
              </p>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {calledNumbers.map((num) => (
                  <span
                    key={num}
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      cardNumbers.includes(num)
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {num}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* راهنما */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">راهنما:</h3>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>برای شروع اعلام خودکار اعداد، روی دکمه "شروع اعلام خودکار" کلیک کنید</li>
            <li>برای تست یک عدد خاص، روی یکی از اعداد موجود در کارت کلیک کنید</li>
            <li>وقتی عددی اعلام می‌شود که در کارت وجود دارد، سکه ظاهر می‌شود و صدا پخش می‌شود</li>
            <li>برای تست حالت BINGO، روی دکمه "تست BINGO" کلیک کنید</li>
            <li>برای ریست کردن همه چیز، روی دکمه "Reset" کلیک کنید</li>
          </ul>
        </div>
        </div>
      </div>
      </div>
    </DingProvider>
  );
}

