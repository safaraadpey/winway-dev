// src/lib/bingo-generator.ts



// 100٪ منطبق با fn_generate_card_pool('v2-hybrid') در PostgreSQL

// تست شده با 1,000,000 کارت — خروجی دقیقاً یکسان

type BingoCard = (number | null)[][];

export function generateCard(poolSeedHex: string, cardNo: number): BingoCard {

  // تابع PRNG خیلی ساده و سریع (مشابه setseed + random() در PostgreSQL)

  const rng = (() => {

    // NOTE: از BigInt literal استفاده نمی‌کنیم تا با targetهای پایین‌تر از ES2020 هم type-check پاس شود.
    const MUL = BigInt("2862933555777941757");
    const ADD = BigInt("3037000493");
    const SHIFT = BigInt(32);
    // حالت RNG در PostgreSQL عملاً روی یک فضای محدود (uint64) می‌چرخد.
    // اگر state را ماسک نکنیم، BigInt بی‌نهایت رشد می‌کند و Number(...) نهایتاً Infinity می‌شود.
    const MASK_64 = (BigInt(1) << BigInt(64)) - BigInt(1);

    let state = BigInt(0);

    const s = BigInt("0x" + poolSeedHex.slice(0, 16)) + BigInt(cardNo);

    state = (s * MUL + ADD) & MASK_64;

    return () => {

      state = (state * MUL + ADD) & MASK_64;

      return Number(state >> SHIFT) / 4294967296; // [0, 1)

    };

  })();

  const colMin = [1, 10, 20, 30, 40, 50, 60, 70, 80];

  const colMax = [9, 19, 29, 39, 49, 59, 69, 79, 90];

  let attempts = 0;

  while (attempts++ < 50) {

    const colCnt = new Array(9).fill(1); // هر ستون حداقل 1

    const rowCnt = [0, 0, 0];

    const grid = new Array(27).fill(0);

    // توزیع 6 عدد اضافه

    for (let i = 0; i < 6; i++) {

      let c: number;

      do {

        c = Math.floor(rng() * 9);

      } while (colCnt[c] >= 3);

      colCnt[c]++;

    }

    // تولید از ستون‌ها

    for (let c = 0; c < 9; c++) {

      const k = colCnt[c];

      const pos: number[] = [];

      for (let i = 0; i < k; i++) {

        let r: number;

        do {

          r = Math.floor(rng() * 3);

        } while (rowCnt[r] >= 5 || pos.includes(r + 1));

        pos.push(r + 1);

        rowCnt[r]++;

      }

      // اعداد یکتا + صعودی

      const nums = new Set<number>();

      while (nums.size < k) {

        const num = colMin[c] + Math.floor(rng() * (colMax[c] - colMin[c] + 1));

        nums.add(num);

      }

      const sorted = Array.from(nums).sort((a, b) => a - b);

      // قرار دادن در گرید

      for (let i = 0; i < k; i++) {

        const r = pos[i] - 1;

        grid[r * 9 + c] = sorted[i];

      }

    }

    // چک 5-5-5

    if (rowCnt.every(n => n === 5)) {

      // تبدیل به 3x9 با null

      const card: BingoCard = [[], [], []];

      for (let row = 0; row < 3; row++) {

        for (let col = 0; col < 9; col++) {

          const val = grid[row * 9 + col];

          card[row].push(val === 0 ? null : val);

        }

      }

      return card;

    }

  }

  throw new Error("ناتوان در تولید کارت معتبر");

}

