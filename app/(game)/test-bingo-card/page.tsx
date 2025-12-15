"use client";

import { useState, useEffect } from 'react';
import BingoCard from '@/components/BingoCard';
import { generateCard } from '@/src/lib/bingo-generator';

/**
 * صفحه تست برای نمایش کامپوننت BingoCard
 * 
 * دسترسی: /game/test-bingo-card
 */
export default function TestBingoCardPage() {
  // تولید کارت نمونه
  const poolSeedHex = "1234567890abcdef1234567890abcdef"; // Seed نمونه (32 کاراکتر hex)
  const cardNo = 1;
  const card = generateCard(poolSeedHex, cardNo);

  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [isWinner, setIsWinner] = useState(false);
  const [autoCall, setAutoCall] = useState(false);

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

      // اگر عدد 85 اعلام شد، برنده شو (برای تست)
      if (nextNumber === 85 && card.some(row => row.includes(85))) {
        setTimeout(() => {
          setIsWinner(true);
        }, 1000);
      }
    }, 2000); // هر 2 ثانیه یک عدد

    return () => clearInterval(interval);
  }, [autoCall, calledNumbers, card]);

  const handleReset = () => {
    setCalledNumbers([]);
    setIsWinner(false);
    setAutoCall(false);
  };

  const handleCallNumber = (number: number) => {
    if (!calledNumbers.includes(number)) {
      setCalledNumbers((prev) => [...prev, number]);
      
      // اگر عدد 85 اعلام شد، برنده شو (برای تست)
      if (number === 85 && card.some(row => row.includes(85))) {
        setTimeout(() => {
          setIsWinner(true);
        }, 1000);
      }
    }
  };

  // پیدا کردن اعداد موجود در کارت
  const cardNumbers: number[] = [];
  card.forEach(row => {
    row.forEach(cell => {
      if (cell !== null && !cardNumbers.includes(cell)) {
        cardNumbers.push(cell);
      }
    });
  });
  cardNumbers.sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">تست کامپوننت BingoCard</h1>

        {/* کنترل‌ها */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
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
              {cardNumbers.map((num) => (
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

        {/* نمایش کارت */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">کارت Bingo</h2>
          
          <div className="flex justify-center">
            <BingoCard
              card={card}
              calledNumbers={calledNumbers}
              isWinner={isWinner}
              playerName="safa1234"
              cardNumber={85}
              size="large"
              onNumberCalled={(number) => {
                console.log('Number called in card:', number);
              }}
            />
          </div>

          {/* اطلاعات کارت */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-sm font-semibold mb-2">اطلاعات کارت:</h3>
            <div className="text-xs text-gray-600 space-y-1">
              <p>Seed: {poolSeedHex.slice(0, 16)}...</p>
              <p>Card No: {cardNo}</p>
              <p>Player: safa1234</p>
              <p>Status: {isWinner ? '🎉 WINNER!' : 'در حال بازی'}</p>
            </div>
          </div>
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
  );
}

