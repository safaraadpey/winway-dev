// src/types/leaderboard.ts
//
// Types for player leaderboard/history page

export interface WinRecord {
  id: string;
  gameTime: string; // زمان بازی
  amountWon: number; // مبلغ برد
  roomName: string; // نام اتاق
  roomCode?: string; // کد اتاق
}

export interface PurchaseRecord {
  id: string;
  purchaseAmount: number; // مبلغ خرید
  cardCount: number; // تعداد برگ (کارت)
  roomName: string; // نام اتاق
  roomCode?: string; // کد اتاق
}

export interface LeaderboardEntry {
  rank: number; // رتبه
  playerId: string; // ID بازیکن
  playerName: string; // نام بازیکن
  displayName?: string; // نام نمایشی (از user_profiles)
  avatarUrl?: string; // آواتار
  totalWins: number; // مجموع برد
  cardCount: number; // تعداد کارت
}

export interface PeriodStats {
  totalWinnings: number; // مجموع مبلغ برد
  tournamentWinnings: number; // مجموع برد تورنومنت
  totalPurchases: number; // مجموع مبلغ خرید
  cardCount: number; // تعداد کارت
  winCount: number; // تعداد برد
  lineWinsCount: number; // تعداد برد خطی
  fullWinsCount: number; // تعداد برد پر
  purchaseCount: number; // تعداد خرید
}

export interface LeaderboardData {
  totalWinningsToday: number; // مجموع مبلغ برد امروز
  totalPurchasesToday: number; // مجموع مبلغ خرید امروز
  wins: WinRecord[]; // لیست بردها
  purchases: PurchaseRecord[]; // لیست خریدها
  leaderboard: LeaderboardEntry[]; // لیست رتبه‌بندی
  stats: {
    daily: PeriodStats;
    weekly: PeriodStats;
    monthly: PeriodStats;
  };
}

