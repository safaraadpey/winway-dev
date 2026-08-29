import type { PlayerPopupContentFeed } from "@/lib/player-popup-content/types";

function minutesFromNowIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

/** Design-time sample for Tournament Break popup content blocks. */
export function createTournamentBreakSampleFeed(
  options?: { breakMinutes?: number }
): PlayerPopupContentFeed {
  const breakMinutes = options?.breakMinutes ?? 12;

  return {
    displayMode: "stack",
    dismissible: false,
    blocks: [
      {
        id: "tb-winners",
        type: "winners",
        order: 1,
        priority: 5,
        title: "برندگان راند قبل",
        prizeLabel: "دینگ",
        winners: [
          { name: "کاربر ۱۲۴۸", prizeAmount: 150 },
          { name: "کاربر ۰۹۳۱", prizeAmount: 90 },
          { name: "کاربر ۷۷۲۰", prizeAmount: 60 },
        ],
      },
      {
        id: "tb-countdown",
        type: "countdown",
        order: 2,
        priority: 20,
        title: "شروع راند بعدی",
        body: "تا شروع راند بعدی میتونی دور بازی کنی و دینگ ببری",
        endsAt: minutesFromNowIso(breakMinutes),
        expiredLabel: "راند بعدی شروع شد",
      },
    ],
  };
}

/** Stable snapshot for static previews (countdown ~12m from load time). */
export const TOURNAMENT_BREAK_SAMPLE_FEED =
  createTournamentBreakSampleFeed();
