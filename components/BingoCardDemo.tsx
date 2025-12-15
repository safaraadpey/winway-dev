"use client";

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import Image from 'next/image';
import dingCoinIcon from '@/src/assets/icons/ding-coin.png';
import styles from './BingoCardDemo.module.css';
import { analyzeCardState } from "@/lib/live-room-helper";

const BASE_WIDTH_PX = 381; // base width including margins/padding for outer wrapper at scale 1

// Types
export type BingoCardData = (number | null)[][];

export type LineWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

interface BingoCardDemoProps {
  calledNumbers?: number[];
  isWinner?: boolean;
  playerName?: string;
  cardNumber?: number;
  size?: 'large' | 'small';
  scale?: number; /* ضریب scale - برای تغییر اندازه کلی کارت */
  isMyCard?: boolean; /* آیا این کارت متعلق به بازیکن فعلی است؟ */
  linePrize?: boolean; /* آیا جایزه خط (سطر کامل) فعال است؟ */
  onNumberCalled?: (number: number) => void;
  cardData?: BingoCardData;
  ticketId?: string;
  lineWinners?: LineWinner[];
}

/**
 * کامپوننت موقت برای تست UI کارت Bingo
 * با داده‌های ثابت - بدون نیاز به بک‌اند
 * 
 * ویژگی‌ها:
 * - نمایش کارت 3x9 با داده‌های ثابت
 * - انیمیشن سکه هنگام اعلام عدد
 * - انیمیشن کل کارت هنگام برنده شدن
 * - نمایش نام بازیکن و شماره کارت در بالای کارت
 * - افکت طلایی برای کارت برنده
 */
export default function BingoCardDemo({
  calledNumbers = [],
  isWinner = false,
  playerName = "safa1234",
  cardNumber = 85,
  size = 'large',
  scale = 1,
  isMyCard = true,
  linePrize = false,
  onNumberCalled,
  cardData,
  ticketId,
  lineWinners = [],
}: BingoCardDemoProps) {
  const defaultCard: BingoCardData = [
    [2, 19, 22, 36, null, null, null, 73, null],
    [null, null, 26, null, 48, 58, 61, null, 85],
    [8, null, null, 34, 43, null, 70, null, 87]
  ];

  const card = cardData ?? defaultCard;

  const [showCoin, setShowCoin] = useState<{ row: number; col: number; number: number } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [flashingNumbers, setFlashingNumbers] = useState<number[]>([]);
  const [completeRows, setCompleteRows] = useState<number[]>([]);
  const [hasShownLinePrizeFlash, setHasShownLinePrizeFlash] = useState(false);
  const [hasShownLinePrizeComplete, setHasShownLinePrizeComplete] = useState(false);
  const previousCalledNumbersRef = useRef<number[]>([]);
  const COIN_ANIMATION_START_DELAY_MS = 500;
  const coinShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coinHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowSizeRef = useRef({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScale, setAutoScale] = useState(1);
  // Ref برای نگه‌داری برنده خط - فقط یک بار در هر بازی نمایش داده می‌شود
  const hasShownLineWinnerRef = useRef<boolean>(false);
  const winnerRowsRef = useRef<number[]>([]);

  // DingBalance دیگر از DingContext تغذیه نمی‌شود؛ فقط از API sync می‌شود.

  // Hook برای اندازه پنجره (برای confetti)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      windowSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      const handleResize = () => {
        windowSizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Auto-scale card to available width while preserving aspect
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    const updateScale = () => {
      const available = el.clientWidth;
      const base = BASE_WIDTH_PX;
      const next = Math.min(1, available / base);
      setAutoScale(next > 0 ? next : 1);
    };

    const ro = new ResizeObserver(updateScale);
    ro.observe(el);
    updateScale();

    return () => ro.disconnect();
  }, []);

  const cardAnalysis = useMemo(
    () =>
      analyzeCardState({
        card,
        calledNumbers,
        previousCalledNumbers: previousCalledNumbersRef.current,
      }),
    [card, calledNumbers]
  );

  useEffect(() => {
    previousCalledNumbersRef.current = [...calledNumbers];
  }, [calledNumbers]);

  // بررسی اعداد جدید اعلام شده و نمایش سکه
  useEffect(() => {
    const clearCoinTimers = () => {
      if (coinShowTimerRef.current) {
        clearTimeout(coinShowTimerRef.current);
        coinShowTimerRef.current = null;
      }
      if (coinHideTimerRef.current) {
        clearTimeout(coinHideTimerRef.current);
        coinHideTimerRef.current = null;
      }
    };

    if (!isMyCard || !cardAnalysis.latestHit) {
      clearCoinTimers();
      setShowCoin(null);
      return;
    }

    const latest = cardAnalysis.latestHit;
    onNumberCalled?.(latest.number);

    // Note: صدای دینگ به useBalances منتقل شده و هنگام افزایش موجودی پخش می‌شود
    clearCoinTimers();
    setShowCoin(null);

    coinShowTimerRef.current = setTimeout(() => {
      coinShowTimerRef.current = null;
      setShowCoin(latest);

      coinHideTimerRef.current = setTimeout(() => {
        coinHideTimerRef.current = null;
        setShowCoin(null);
      }, 600);
    }, COIN_ANIMATION_START_DELAY_MS);

    return () => {
      clearCoinTimers();
    };
  }, [cardAnalysis.latestHit, isMyCard, onNumberCalled]);

  // انیمیشن برنده شدن (فقط برای کارت خود بازیکن)
  useEffect(() => {
    if (isWinner && isMyCard) {
      setShowConfetti(true);
      // پخش صدای بینگو
      playBingo();
      // پاک کردن confetti بعد از 5 ثانیه
      setTimeout(() => {
        setShowConfetti(false);
      }, 5000);
    } else if (isWinner && !isMyCard) {
      // برای کارت بقیه: فقط state را set کن اما انیمیشن نده
      setShowConfetti(false);
    } else {
      setShowConfetti(false);
    }
  }, [isWinner, isMyCard]);

  // Reset hasShownLinePrizeFlash و hasShownLinePrizeComplete وقتی بازی reset می‌شود
  useEffect(() => {
    if (calledNumbers.length === 0) {
      setHasShownLinePrizeFlash(false);
      setHasShownLinePrizeComplete(false);
    }
  }, [calledNumbers.length]);

  // بررسی اعداد فلاش‌کننده (تقریباً کامل شدن سطر یا کارت) - فقط برای کارت خود بازیکن
  useEffect(() => {
    // اگر کارت متعلق به بازیکن دیگر است، فلاش نکن
    if (!isMyCard) {
      setFlashingNumbers([]);
      return;
    }

    if (calledNumbers.length === 0 || isWinner) {
      setFlashingNumbers([]);
      return;
    }

    // اول بررسی می‌کنیم آیا کارت تقریباً فول شده (اولویت بالاتر)
    const almostCompleteCardNumber = cardAnalysis.almostCompleteCardNumber;
    if (almostCompleteCardNumber !== null) {
      setFlashingNumbers([almostCompleteCardNumber]);
      return;
    }

    // اگر linePrize فعال باشد و قبلاً فلاش سطر نشان داده نشده، بررسی می‌کنیم آیا سطرهایی تقریباً کامل شده‌اند
    if (linePrize && !hasShownLinePrizeFlash) {
      const almostCompleteRowNumbers = cardAnalysis.almostCompleteRowNumbers;
      if (almostCompleteRowNumbers.length > 0) {
        setFlashingNumbers(almostCompleteRowNumbers);
        setHasShownLinePrizeFlash(true); // علامت می‌زنیم که فلاش سطر نشان داده شده
        return;
      }
    }

    // اگر هیچ کدام نبود، فلاش را خاموش کن
    setFlashingNumbers([]);
  }, [calledNumbers, card, isWinner, isMyCard, linePrize, hasShownLinePrizeFlash]);

  // تشخیص سطرهای کامل شده (فقط برای کارت خود بازیکن و اگر linePrize فعال باشد)
  // فقط اولین سطر کامل شده کادر طلایی می‌گیرد و باقی می‌ماند
  useEffect(() => {
    if (!isMyCard || !linePrize) {
      setCompleteRows([]);
      return;
    }

    if (calledNumbers.length === 0) {
      setCompleteRows([]);
      return;
    }

    // اگر قبلاً یک سطر کامل شده، کادر طلایی را نگه دار (محو نکن)
    if (hasShownLinePrizeComplete) {
      // کادر طلایی را نگه دار - completeRows را تغییر نده
      return;
    }

    const completed = cardAnalysis.completeRows;
    
    // اگر اولین سطر کامل شده پیدا شد، آن را نشان بده و علامت بزن
    if (completed.length > 0) {
      setCompleteRows([completed[0]]); // فقط اولین سطر کامل شده
      setHasShownLinePrizeComplete(true);
    }
  }, [calledNumbers, card, isMyCard, linePrize, hasShownLinePrizeComplete]);

  // Reset refs وقتی lineWinners خالی می‌شود (بازی جدید شروع شده)
  useEffect(() => {
    if (!lineWinners || lineWinners.length === 0) {
      if (hasShownLineWinnerRef.current) {
        console.log('[BingoCardDemo] Resetting line winner refs (new game started)');
        hasShownLineWinnerRef.current = false;
        winnerRowsRef.current = [];
      }
    }
  }, [lineWinners]);

  const winnerRows = useMemo(() => {
    // اگر قبلاً برنده خط نمایش داده شده، همان مقدار قبلی را برگردان
    if (hasShownLineWinnerRef.current) {
      return winnerRowsRef.current;
    }

    if (!ticketId) return [];
    if (!lineWinners || lineWinners.length === 0) return [];
    
    // پیدا کردن اولین برنده خط (با کمترین drawNumber)
    const firstLineWinner = lineWinners.reduce((first, current) => {
      if (!first) return current;
      const currentDraw = current.drawNumber ?? Infinity;
      const firstDraw = first.drawNumber ?? Infinity;
      return currentDraw < firstDraw ? current : first;
    }, null as LineWinner | null);
    
    if (!firstLineWinner) return [];
    
    // فقط اگر این کارت اولین برنده خط است، خط طلایی را نمایش بده
    if (String(firstLineWinner.ticketId) !== String(ticketId)) return [];

    // پیدا کردن تمام سطرهای کامل شده این کارت
    const rows = card.reduce((rows: number[], row, idx) => {
      const values = row.filter((n): n is number => n !== null);
      if (values.length > 0 && values.every((n) => calledNumbers.includes(n))) {
        rows.push(idx);
      }
      return rows;
    }, []);

    // اگر سطرهای برنده پیدا شد، آن‌ها را ذخیره کن و flag را true کن
    if (rows.length > 0) {
      winnerRowsRef.current = rows;
      hasShownLineWinnerRef.current = true;
      console.log('[BingoCardDemo] Line winner displayed for ticket:', ticketId, 'rows:', rows);
    }

    return rows;
  }, [card, calledNumbers, lineWinners, ticketId]);

  // Note: صدای دینگ (playDing) به useBalances منتقل شده است
  // و هنگام افزایش موجودی در DingHeader پخش می‌شود

  const playBingo = () => {
    if (typeof window !== 'undefined' && window.AudioContext) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50]; // C, E, G, C (C major chord)
      
      notes.forEach((freq, index) => {
        setTimeout(() => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.frequency.value = freq;
          oscillator.type = 'sine';
          
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
          
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
        }, index * 100);
      });
    }
  };

  // بررسی اینکه آیا یک سلول مارک شده است
  const isMarked = (value: number | null) => {
    if (value === null) return false;
    return cardAnalysis.markedNumbers.has(value);
  };

  // انتخاب کلاس‌های CSS بر اساس size
  const cellSizeClass = size === 'large' ? styles.cellLarge : styles.cellSmall;
  const labelSizeClass = size === 'large' ? styles.headerLabelLarge : styles.headerLabelSmall;

  return (
    <div 
      ref={containerRef}
      className={styles.container}
      style={{ '--card-scale': scale * autoScale } as React.CSSProperties}
    >
      {/* نمایش confetti (فقط برای کارت خود بازیکن) */}
      {showConfetti && isMyCard && (
        <Confetti
          width={windowSizeRef.current.width}
          height={windowSizeRef.current.height}
          recycle={false}
          numberOfPieces={500}
          gravity={0.3}
        />
      )}

      <div className={styles.outer}>
        {/* Wrapper با بکگراند اصلی کارت */}
        <div className={styles.wrapper}>
          {/* Header: نام کاربر و شماره کارت */}
          <div className={styles.header}>
            <div className={`${styles.headerLabel} ${labelSizeClass}`}>
              {playerName && <span>{playerName}</span>}
            </div>
            <div className={`${styles.headerLabel} ${labelSizeClass}`}>
              {cardNumber && <span>{cardNumber}</span>}
            </div>
          </div>

          {/* کارت Bingo */}
          <div
            className={`${styles.cardGrid} ${
              isWinner && isMyCard ? styles.cardGridWinner : ''
            }`}
          >
          {card.map((row, rowIndex) =>
            row.map((value, colIndex) => {
              const isEmpty = value === null;
              const marked = isMarked(value);
              const isCoinShowing =
                showCoin?.row === rowIndex && showCoin?.col === colIndex;
              const isFlashing = value !== null && flashingNumbers.includes(value);
              // فقط سطرهایی که واقعاً برنده خط شده‌اند (از دیتابیس) طلایی می‌شوند
              // completeRows فقط برای فلاش قبل از برنده شدن استفاده می‌شود
              const isInCompleteRow = winnerRows.includes(rowIndex);

              return (
                <motion.div
                  key={`${rowIndex}-${colIndex}`}
                  className={`${styles.cell} ${cellSizeClass} ${
                    isEmpty
                      ? styles.cellEmpty
                      : marked
                      ? styles.cellMarked
                      : styles.cellFilled
                  } ${isFlashing ? styles.cellFlashing : ''} ${isInCompleteRow ? styles.cellCompleteRow : ''}`}
                  animate={
                    isCoinShowing
                      ? {
                          scale: [1, 1.1, 1],
                        }
                      : isFlashing
                      ? {
                          scale: [1, 1.2, 1],
                        }
                      : {}
                  }
                  transition={
                    isFlashing
                      ? {
                          duration: 1,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }
                      : {
                          duration: 0.3,
                          ease: 'easeInOut',
                        }
                  }
                >
                  {/* عدد */}
                  {!isEmpty && (
                    <motion.span
                      className={`${styles.cellNumber} ${
                        marked ? styles.cellNumberMarked : styles.cellNumberNormal
                      }`}
                      initial={false}
                      animate={{
                        opacity: marked ? 0.3 : 1,
                      }}
                      transition={{
                        duration: 0.6,
                        delay: isCoinShowing ? 0.3 : 0,
                      }}
                    >
                      {value}
                    </motion.span>
                  )}

                  {/* انیمیشن سکه */}
                  <AnimatePresence>
                    {isCoinShowing && (
                      <motion.div
                        className={styles.coinAnimation}
                        initial={{
                          scale: 0,
                          opacity: 0,
                        }}
                        animate={{
                          scale: [0, 1.2, 1],
                          opacity: [0, 1, 1, 0],
                        }}
                        exit={{
                          scale: 0,
                          opacity: 0,
                        }}
                        transition={{
                          duration: 0.6,
                          ease: 'easeInOut',
                        }}
                      >
                        <Image
                          src={dingCoinIcon}
                          alt="Ding Coin"
                          width={34}
                          height={34}
                          className="drop-shadow-lg"
                          priority
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}

          {/* متن BINGO هنگام برنده شدن (فقط برای کارت خود بازیکن) */}
          <AnimatePresence>
            {isWinner && isMyCard && (
              <motion.div
                className={styles.bingoOverlay}
                initial={{
                  scale: 0,
                  opacity: 0,
                }}
                animate={{
                  scale: [0, 1.2, 1],
                  opacity: [0, 1, 1],
                }}
                exit={{
                  scale: 0,
                  opacity: 0,
                }}
                transition={{
                  duration: 0.5,
                  ease: 'easeOut',
                }}
              >
                <motion.div
                  className={styles.bingoText}
                  animate={{
                    scale: [1, 1.1, 1],
                    rotate: [0, 5, -5, 0],
                  }}
                  transition={{
                    duration: 0.5,
                    repeat: Infinity,
                    repeatType: 'reverse',
                  }}
                >
                  BINGO!
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

