/**
 * منطق تشخیص برنده شدن در بازی Bingo
 * 
 * قوانین:
 * - فقط Full Card Bingo: تمام اعداد غیر null در کارت باید اعلام شده باشند
 * - Bingo Row (سطر کامل) و Bingo Column (ستون کامل) در نظر گرفته نمی‌شوند
 */

export type BingoCardData = (number | null)[][];

/**
 * بررسی می‌کند آیا کارت Full Card Bingo است یا نه
 * 
 * @param card - آرایه 2 بعدی کارت Bingo (3x9)
 * @param calledNumbers - لیست اعداد اعلام شده
 * @returns true اگر تمام اعداد غیر null در کارت اعلام شده باشند
 */
export function checkFullCardBingo(
  card: BingoCardData,
  calledNumbers: number[]
): boolean {
  // استخراج تمام اعداد غیر null از کارت
  const cardNumbersSet = new Set<number>();
  
  for (let row = 0; row < card.length; row++) {
    for (let col = 0; col < card[row].length; col++) {
      const value = card[row][col];
      if (value !== null && value !== undefined) {
        const n = Number(value);
        if (Number.isFinite(n)) cardNumbersSet.add(n);
      }
    }
  }

  // اگر کارت خالی است، برنده نیست
  if (cardNumbersSet.size === 0) {
    return false;
  }

  const called = new Set(
    calledNumbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  );

  // بررسی اینکه آیا تمام اعداد کارت در لیست اعداد اعلام شده هستند
  for (const num of cardNumbersSet) {
    if (!called.has(num)) {
      return false;
    }
  }

  return true;
}

/**
 * استخراج تمام اعداد موجود در کارت (غیر null)
 * 
 * @param card - آرایه 2 بعدی کارت Bingo
 * @returns آرایه اعداد موجود در کارت
 */
export function getCardNumbers(card: BingoCardData): number[] {
  const numbers: number[] = [];
  
  for (let row = 0; row < card.length; row++) {
    for (let col = 0; col < card[row].length; col++) {
      const value = card[row][col];
      if (value !== null && value !== undefined) {
        numbers.push(value);
      }
    }
  }

  return numbers;
}

/**
 * بررسی می‌کند آیا یک عدد خاص در کارت وجود دارد
 * 
 * @param card - آرایه 2 بعدی کارت Bingo
 * @param number - عدد مورد بررسی
 * @returns true اگر عدد در کارت وجود داشته باشد
 */
export function isNumberInCard(card: BingoCardData, number: number): boolean {
  for (let row = 0; row < card.length; row++) {
    for (let col = 0; col < card[row].length; col++) {
      if (card[row][col] === number) {
        return true;
      }
    }
  }
  return false;
}

/**
 * پیدا کردن تمام اعداد باقی‌مانده در سطرهایی که تقریباً کامل شده‌اند (4 از 5 عدد خوانده شده)
 * 
 * @param card - آرایه 2 بعدی کارت Bingo
 * @param calledNumbers - لیست اعداد اعلام شده
 * @returns آرایه اعداد باقی‌مانده (ممکن است چند سطر همزمان در این حالت باشند)
 */
export function getAlmostCompleteRowNumber(
  card: BingoCardData,
  calledNumbers: number[]
): number[] {
  const remainingNumbers: number[] = [];

  for (let row = 0; row < card.length; row++) {
    const rowNumbers: number[] = [];
    const rowPositions: { number: number; col: number }[] = [];
    
    // استخراج اعداد غیر null از سطر
    for (let col = 0; col < card[row].length; col++) {
      const value = card[row][col];
      if (value !== null && value !== undefined) {
        rowNumbers.push(value);
        rowPositions.push({ number: value, col });
      }
    }

    // اگر سطر 5 عدد دارد (قانون Bingo)
    if (rowNumbers.length === 5) {
      // شمارش اعداد خوانده شده در این سطر
      let calledCount = 0;
      let remainingNumber: number | null = null;

      for (const { number } of rowPositions) {
        if (calledNumbers.includes(number)) {
          calledCount++;
        } else {
          remainingNumber = number;
        }
      }

      // اگر 4 عدد خوانده شده و 1 عدد باقی مانده
      if (calledCount === 4 && remainingNumber !== null) {
        // اضافه کردن به لیست (بدون تکرار)
        if (!remainingNumbers.includes(remainingNumber)) {
          remainingNumbers.push(remainingNumber);
        }
      }
    }
  }

  return remainingNumbers;
}

/**
 * پیدا کردن سطرهای کامل شده (تمام 5 عدد خوانده شده)
 * 
 * @param card - آرایه 2 بعدی کارت Bingo
 * @param calledNumbers - لیست اعداد اعلام شده
 * @returns آرایه شماره سطرهای کامل شده (0-based index)
 */
export function getCompleteRows(
  card: BingoCardData,
  calledNumbers: number[]
): number[] {
  const completeRows: number[] = [];
  const called = new Set(
    calledNumbers.map((n) => Number(n)).filter((n) => Number.isFinite(n))
  );

  for (let row = 0; row < card.length; row++) {
    const rowNumbers: number[] = [];
    
    // استخراج اعداد غیر null از سطر
    for (let col = 0; col < card[row].length; col++) {
      const value = card[row][col];
      if (value !== null && value !== undefined) {
        const n = Number(value);
        if (Number.isFinite(n)) rowNumbers.push(n);
      }
    }

    // اگر سطر 5 عدد دارد (قانون Bingo)
    if (rowNumbers.length === 5) {
      const allCalled = rowNumbers.every((num) => called.has(num));
      
      if (allCalled) {
        completeRows.push(row);
      }
    }
  }

  return completeRows;
}

/**
 * پیدا کردن عدد باقی‌مانده در کارتی که تقریباً فول شده (فقط 1 عدد باقی مانده)
 * 
 * @param card - آرایه 2 بعدی کارت Bingo
 * @param calledNumbers - لیست اعداد اعلام شده
 * @returns عدد باقی‌مانده یا null اگر کارت فول نشده یا بیش از 1 عدد باقی مانده باشد
 */
export function getAlmostCompleteCardNumber(
  card: BingoCardData,
  calledNumbers: number[]
): number | null {
  const allCardNumbers: number[] = [];
  
  // استخراج تمام اعداد غیر null از کارت
  for (let row = 0; row < card.length; row++) {
    for (let col = 0; col < card[row].length; col++) {
      const value = card[row][col];
      if (value !== null && value !== undefined) {
        allCardNumbers.push(value);
      }
    }
  }

  // اگر کارت خالی است
  if (allCardNumbers.length === 0) {
    return null;
  }

  // شمارش اعداد خوانده شده
  let calledCount = 0;
  let remainingNumber: number | null = null;

  for (const num of allCardNumbers) {
    if (calledNumbers.includes(num)) {
      calledCount++;
    } else {
      remainingNumber = num;
    }
  }

  // اگر فقط 1 عدد باقی مانده (یعنی calledCount === allCardNumbers.length - 1)
  if (calledCount === allCardNumbers.length - 1 && remainingNumber !== null) {
    return remainingNumber;
  }

  return null;
}

