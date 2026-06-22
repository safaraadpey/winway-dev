"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLiveRoomSnapshot,
  type LiveRoomSnapshot,
  fetchRoomResults,
  fetchRoomResultsWhenPrizesReady,
  type RoomResultsResponse,
} from "@/services/rooms";
import BingoCardDemo from "@/components/BingoCardDemo";
import RoomHeader from "@/components/room/RoomHeader";
import DrawStrip from "@/components/room/DrawStrip";
import GameResultsDialog from "@/components/GameResultsDialog";
import gameHeaderBg from "@/src/assets/logo/gameheader.webp";
import {
  buildGameResultsKey,
  hasSeenGameResults,
  markSeenGameResults,
} from "@/lib/gameResultsDedupe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { playNumber } from "@/lib/number-audio";
import { playLiveRoomMusic, stopLiveRoomMusic } from "@/lib/audio/music";
import { isMusicEnabled } from "@/lib/audio-settings";
import {
  mergeDrawLists,
  sortDraws,
  type ProcessedDraw,
} from "@/lib/draw-order";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import { useSession } from "@/lib/contexts/SessionContext";
import { isHardExiting } from "@/lib/auth/hardExit";
import styles from "./LiveRoomScreen.module.css";
import loadingStyles from "@/components/playerScreenLoading.module.css";

type CardWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

type LineWinner = CardWinner;
type FullWinner = CardWinner;

interface LiveRoomScreenProps {
  roomId: string;
}

/** اگر این مدت هیچ draw sync نشد (ریل‌تایم + poll)، یک بار draw poll می‌زنیم. */
const DRAW_SYNC_BUFFER_MS = 1500;
/** Must match engine default when rooms.meta.draw_interval_sec is unset. */
const DEFAULT_DRAW_INTERVAL_SEC = 3;
/** fallback کامل snapshot (status/winners) */
const REALTIME_STALE_MS = 12_000;
const REALTIME_WATCHDOG_TICK_MS = 2_000;
const DRAW_WATCHDOG_TICK_MS = 1_000;
/** شمارش معکوس بصری DrawStrip قبل از اولین عدد (جدا از next_draw_at سرور). */
const VISUAL_PRE_DRAW_COUNTDOWN_START = 5;

const ACTIVE_ROOM_STATUSES = new Set([
  "waiting",
  "running",
  "playing",
  "live",
  "settling",
]);

const PLAYING_ROOM_STATUSES = new Set(["running", "playing", "live"]);

function mapWinnersFromApi(
  winners: RoomResultsResponse["lineWinners"],
  cards: LiveRoomSnapshot["cards"]
): CardWinner[] {
  if (!winners?.length) return [];

  return winners
    .map((winner) => {
      let ticketId = winner.ticketId;
      if (!ticketId) {
        const card = cards.find((c) => c.player_id === winner.id);
        if (!card) return null;
        ticketId = card.ticket_id;
      }
      return {
        ticketId,
        userId: winner.id,
        drawNumber: winner.drawNumber ?? 0,
      };
    })
    .filter((w): w is CardWinner => w !== null);
}

function cardWinnersEqual(a: CardWinner[], b: CardWinner[]): boolean {
  if (a.length !== b.length) return false;
  const key = (w: CardWinner) => `${w.ticketId}:${w.drawNumber}`;
  const setA = new Set(a.map(key));
  return b.every((w) => setA.has(key(w)));
}

function isRoomTerminalStatus(status: string): boolean {
  const normalized = (status || "").trim().toLowerCase();
  return (
    normalized !== "" &&
    !["running", "playing", "live", "waiting"].includes(normalized)
  );
}

function isFullWinRevealedInUi(
  fullWinners: FullWinner[],
  calledNumbers: number[]
): boolean {
  if (fullWinners.length === 0) return true;
  return fullWinners.every((w) => {
    const draw = w.drawNumber;
    if (draw == null || draw === 0) return true;
    return calledNumbers.includes(draw);
  });
}

/** پاپ‌آپ نتایج وقتی اتاق تمام شده و توپ برنده full در UI دیده شده. */
function canOpenResultsDialog(
  fullWinners: FullWinner[],
  calledNumbers: number[],
  status: string
): boolean {
  const terminal = isRoomTerminalStatus(status);
  if (!terminal && fullWinners.length === 0) return false;
  if (!isFullWinRevealedInUi(fullWinners, calledNumbers)) return false;
  return terminal || fullWinners.length > 0;
}

export default function LiveRoomScreen({ roomId }: LiveRoomScreenProps) {
  const router = useRouter();
  const session = useSession();
  const { setShowStatusBar, setBalanceRefreshDisabled } = useHeaderVisibility();
  const { creditDingOnReveal, scheduleWalletBalanceSync, refreshAllBalances } =
    useBalancesContext();
  const { invalidate: invalidateActiveGames } = useActiveGamesContext();

  const [data, setData] = useState<LiveRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [lineWinners, setLineWinners] = useState<LineWinner[]>([]);
  const [fullWinners, setFullWinners] = useState<FullWinner[]>([]);

  const [results, setResults] = useState<RoomResultsResponse | null>(null);
  const [resultsRequested, setResultsRequested] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const resultsRequestedRef = useRef(false);
  const openingResultsRef = useRef(false);
  const lastRealtimeActivityRef = useRef(Date.now());
  const lastDrawSyncAtRef = useRef(Date.now());
  const pollInFlightRef = useRef(false);
  const roomStatusRef = useRef<string>("");
  const drawIntervalSecRef = useRef(DEFAULT_DRAW_INTERVAL_SEC);

  useEffect(() => {
    resultsRequestedRef.current = resultsRequested;
  }, [resultsRequested]);

  const fullWinnersRef = useRef<FullWinner[]>([]);
  const calledNumbersRef = useRef<number[]>([]);
  /** After first snapshot, fire audio/ding only for draws that arrive live. */
  const drawsHydratedRef = useRef(false);
  /** How many authoritative draws have been revealed in the UI (paced queue). */
  const revealedDrawCountRef = useRef(0);
  const [revealedDrawCount, setRevealedDrawCount] = useState(0);
  const lastRevealAtRef = useRef(0);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** RT draws received while a draw poll is in-flight (merged when poll completes). */
  const pendingRtDrawsRef = useRef<ProcessedDraw[]>([]);
  const winnersSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const tryOpenResultsDialog = useCallback(async () => {
    if (resultsRequestedRef.current || openingResultsRef.current) return;

    const status = (
      dataRef.current?.room?.status ||
      roomStatusRef.current ||
      ""
    )
      .trim()
      .toLowerCase();

    if (
      !canOpenResultsDialog(
        fullWinnersRef.current,
        calledNumbersRef.current,
        status
      )
    ) {
      return;
    }

    const key = buildGameResultsKey({
      roomName: roomId,
      status: "finished",
      finishedAtHint: null,
    });
    if (hasSeenGameResults(key)) return;

    openingResultsRef.current = true;
    resultsRequestedRef.current = true;
    setResultsRequested(true);

    const isTournamentRoom = !!dataRef.current?.tournament?.id;

    try {
      const res = await fetchRoomResultsWhenPrizesReady(roomId, {
        maxAttempts: isTournamentRoom ? 10 : 30,
        delayMs: isTournamentRoom ? 200 : 500,
      });
      setResults(res);
      setShowResultsDialog(true);
      markSeenGameResults(key);
      if (!isTournamentRoom) {
        scheduleWalletBalanceSync?.(`room-settled:${roomId}`);
      }
    } catch (err) {
      console.error("[LiveRoom] winners fetch error:", err);
      setShowResultsDialog(true);
      markSeenGameResults(key);
    } finally {
      openingResultsRef.current = false;
    }
  }, [roomId, scheduleWalletBalanceSync]);

  const syncWinnersFromApi = useCallback(
    async (snapshot: LiveRoomSnapshot | null | undefined) => {
      if (!snapshot) return;
      try {
        const roomResults = await fetchRoomResults(roomId);
        if (!snapshot.tournament?.id) {
          const nextLine = mapWinnersFromApi(
            roomResults.lineWinners,
            snapshot.cards
          );
          setLineWinners((prev) =>
            cardWinnersEqual(prev, nextLine) ? prev : nextLine
          );
        }
        const nextFull = mapWinnersFromApi(
          roomResults.fullWinners,
          snapshot.cards
        );
        setFullWinners((prev) =>
          cardWinnersEqual(prev, nextFull) ? prev : nextFull
        );
      } catch (err) {
        console.warn("[LiveRoom] winners sync failed:", err);
      }
    },
    [roomId]
  );

  const syncWinnersFromApiRef = useRef(syncWinnersFromApi);
  useEffect(() => {
    syncWinnersFromApiRef.current = syncWinnersFromApi;
  }, [syncWinnersFromApi]);

  // شمارش معکوس بصری تا اولین draw در DrawStrip (۵→…→۰، سپس ماندن روی ۰)
  const [firstDrawCountdownSec, setFirstDrawCountdownSec] = useState<number | null>(null);

  // برای استفاده داخل callback های realtime (جلوگیری از stale closure)
  const dataRef = useRef<LiveRoomSnapshot | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const countMatchedMyCards = useCallback(
    (number: number, snapshot: LiveRoomSnapshot | null | undefined): number => {
      if (!snapshot?.cards?.length) return 0;
      return snapshot.cards.reduce((count, c) => {
        if (!c.is_my_card) return count;
        const hasNumber =
          c.card?.some((row) => row.some((v) => v === number)) ?? false;
        return hasNumber ? count + 1 : count;
      }, 0);
    },
    []
  );

  const creditDingForRevealedNumber = useCallback(
    (number: number, snapshot: LiveRoomSnapshot | null | undefined) => {
      if (!roomId || number == null) return;

      const matchedCards = countMatchedMyCards(number, snapshot);
      if (matchedCards <= 0) return;

      const dingPerNumber = Math.max(
        0,
        Number(snapshot?.room?.ding_per_number ?? 1) || 1
      );
      const delta = matchedCards * dingPerNumber;
      creditDingOnReveal?.(`${roomId}:${number}`, delta);
    },
    [roomId, countMatchedMyCards, creditDingOnReveal]
  );

  const authoritativeCalledNumbers = useMemo(
    () => sortDraws(data?.draws ?? []).map((d) => d.number),
    [data?.draws]
  );

  const displayedCalledNumbers = useMemo(
    () => authoritativeCalledNumbers.slice(0, revealedDrawCount),
    [authoritativeCalledNumbers, revealedDrawCount]
  );

  const handleNewDraw = useCallback(
    (number: number) => {
      void playNumber(number);
      creditDingForRevealedNumber(number, dataRef.current);
      if (winnersSyncDebounceRef.current) {
        clearTimeout(winnersSyncDebounceRef.current);
      }
      winnersSyncDebounceRef.current = setTimeout(() => {
        void syncWinnersFromApiRef.current(dataRef.current);
      }, 800);
    },
    [creditDingForRevealedNumber]
  );

  const scheduleNextDrawReveal = useCallback(() => {
    if (revealTimerRef.current) return;

    const sorted = sortDraws(dataRef.current?.draws ?? []);
    if (revealedDrawCountRef.current >= sorted.length) return;

    const intervalMs = Math.max(drawIntervalSecRef.current * 1000, 500);
    const elapsed = Date.now() - lastRevealAtRef.current;
    const delay = elapsed >= intervalMs ? 0 : intervalMs - elapsed;

    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null;
      const latestSorted = sortDraws(dataRef.current?.draws ?? []);
      const nextIdx = revealedDrawCountRef.current;
      if (nextIdx >= latestSorted.length) return;

      handleNewDraw(latestSorted[nextIdx]!.number);
      revealedDrawCountRef.current = nextIdx + 1;
      setRevealedDrawCount(nextIdx + 1);
      lastRevealAtRef.current = Date.now();

      if (revealedDrawCountRef.current < latestSorted.length) {
        scheduleNextDrawRevealRef.current();
      }
    }, delay);
  }, [handleNewDraw]);

  const scheduleNextDrawRevealRef = useRef(scheduleNextDrawReveal);
  useEffect(() => {
    scheduleNextDrawRevealRef.current = scheduleNextDrawReveal;
  }, [scheduleNextDrawReveal]);

  useEffect(() => {
    fullWinnersRef.current = fullWinners;
  }, [fullWinners]);

  useEffect(() => {
    calledNumbersRef.current = displayedCalledNumbers;
  }, [displayedCalledNumbers]);

  useEffect(() => {
    const authCount = sortDraws(data?.draws ?? []).length;

    if (loading) return;

    if (!drawsHydratedRef.current) {
      drawsHydratedRef.current = true;
      revealedDrawCountRef.current = authCount;
      setRevealedDrawCount(authCount);
      lastRevealAtRef.current = Date.now();
      return;
    }

    if (authCount < revealedDrawCountRef.current) {
      revealedDrawCountRef.current = authCount;
      setRevealedDrawCount(authCount);
    }

    if (authCount > revealedDrawCountRef.current) {
      scheduleNextDrawRevealRef.current();
    }
  }, [data?.draws, loading]);

  useEffect(() => {
    if (resultsRequestedRef.current) return;
    const status = (data?.room?.status || "").trim().toLowerCase();
    if (!canOpenResultsDialog(fullWinners, displayedCalledNumbers, status)) {
      return;
    }
    void tryOpenResultsDialog();
  }, [
    data?.room?.status,
    data?.draws?.length,
    fullWinners,
    displayedCalledNumbers,
    tryOpenResultsDialog,
  ]);

  useEffect(() => {
    drawIntervalSecRef.current =
      data?.room?.draw_interval_sec ?? DEFAULT_DRAW_INTERVAL_SEC;
  }, [data?.room?.draw_interval_sec]);

  const markRealtimeActivity = useCallback(() => {
    lastRealtimeActivityRef.current = Date.now();
  }, []);

  const markDrawSync = useCallback(() => {
    const now = Date.now();
    lastDrawSyncAtRef.current = now;
    lastRealtimeActivityRef.current = now;
  }, []);

  const markDrawSynced = markDrawSync;

  const runDrawSyncPoll = useCallback(async () => {
    if (isHardExiting()) return;
    if (!roomId || pollInFlightRef.current) return;

    const status = roomStatusRef.current;
    if (!PLAYING_ROOM_STATUSES.has(status)) return;

    pollInFlightRef.current = true;
    try {
      const snapshot = await fetchLiveRoomSnapshot(roomId, { scope: "draws" });
      roomStatusRef.current = (snapshot.room.status || "").trim().toLowerCase();
      const pending = pendingRtDrawsRef.current;
      pendingRtDrawsRef.current = [];
      const mergedDraws = mergeDrawLists(snapshot.draws, pending);
      setData((prev) =>
        prev
          ? {
              ...prev,
              draws: mergedDraws,
              room: {
                ...prev.room,
                status: snapshot.room.status ?? prev.room.status,
                next_draw_at:
                  snapshot.room.next_draw_at ?? prev.room.next_draw_at ?? null,
                draw_interval_sec:
                  snapshot.room.draw_interval_sec ?? prev.room.draw_interval_sec,
              },
              server_now: snapshot.server_now ?? prev.server_now,
            }
          : prev
      );
      markDrawSynced();
      console.log("[LiveRoom] draw sync poll (realtime draw stale)", {
        serverDraws: snapshot.draws.length,
        pendingRt: pending.length,
        mergedDraws: mergedDraws.length,
      });
    } catch (err) {
      console.warn("[LiveRoom] draw sync poll error:", err);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [roomId, markDrawSynced]);

  const runDrawSyncPollRef = useRef(runDrawSyncPoll);
  useEffect(() => {
    runDrawSyncPollRef.current = runDrawSyncPoll;
  }, [runDrawSyncPoll]);

  const runFallbackPoll = useCallback(async () => {
    if (isHardExiting()) return;
    if (!roomId || pollInFlightRef.current) return;

    const status = roomStatusRef.current;
    if (status && !ACTIVE_ROOM_STATUSES.has(status)) return;

    pollInFlightRef.current = true;
    try {
      const snapshot = await fetchLiveRoomSnapshot(roomId);
      const nextStatus = (snapshot.room.status || "").trim().toLowerCase();
      roomStatusRef.current = nextStatus;
      const pending = pendingRtDrawsRef.current;
      pendingRtDrawsRef.current = [];
      const mergedDraws = mergeDrawLists(snapshot.draws, pending);
      setData({ ...snapshot, draws: mergedDraws });
      markDrawSynced();

      const isTerminal = ["settling", "finished", "cancelled"].includes(
        nextStatus
      );
      await syncWinnersFromApi(snapshot);
      if (isTerminal) void tryOpenResultsDialog();

      markRealtimeActivity();
      console.log("[LiveRoom] fallback poll synced (realtime was stale)");
    } catch (err) {
      console.warn("[LiveRoom] fallback poll error:", err);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [
    roomId,
    markDrawSynced,
    syncWinnersFromApi,
    tryOpenResultsDialog,
    markRealtimeActivity,
  ]);

  const runFallbackPollRef = useRef(runFallbackPoll);
  useEffect(() => {
    runFallbackPollRef.current = runFallbackPoll;
  }, [runFallbackPoll]);

  const markRealtimeActivityRef = useRef(markRealtimeActivity);
  useEffect(() => {
    markRealtimeActivityRef.current = markRealtimeActivity;
  }, [markRealtimeActivity]);

  // state پاپ‌آپ و sync اعداد با عوض شدن room ریست شود
  useEffect(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    pendingRtDrawsRef.current = [];
    drawsHydratedRef.current = false;
    revealedDrawCountRef.current = 0;
    setRevealedDrawCount(0);
    lastRevealAtRef.current = 0;
    setResultsRequested(false);
    setShowResultsDialog(false);
    setResults(null);
    resultsRequestedRef.current = false;
    openingResultsRef.current = false;
    lastRealtimeActivityRef.current = Date.now();
    lastDrawSyncAtRef.current = Date.now();
    roomStatusRef.current = "";
    setFirstDrawCountdownSec(null);
  }, [roomId]);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (displayedCalledNumbers.length > 0) {
      setFirstDrawCountdownSec(null);
      return;
    }

    const status = (data?.room?.status || roomStatusRef.current || "")
      .trim()
      .toLowerCase();
    if (PLAYING_ROOM_STATUSES.has(status)) {
      setFirstDrawCountdownSec(null);
      return;
    }

    setFirstDrawCountdownSec(VISUAL_PRE_DRAW_COUNTDOWN_START);

    const id = setInterval(() => {
      setFirstDrawCountdownSec((prev) => {
        if (prev == null) return VISUAL_PRE_DRAW_COUNTDOWN_START;
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [displayedCalledNumbers.length, roomId, data?.room?.status]);

  // مخفی کردن استاتوس‌بار
  useEffect(() => {
    setShowStatusBar(false);
    return () => setShowStatusBar(true);
  }, [setShowStatusBar]);

  // غیرفعال کردن refresh دستی ding/toman در هدر حین بازی فعال
  useEffect(() => {
    const status = (data?.room?.status || "").trim().toLowerCase();
    const isActivePlay = PLAYING_ROOM_STATUSES.has(status);
    setBalanceRefreshDisabled(isActivePlay);
    return () => setBalanceRefreshDisabled(false);
  }, [data?.room?.status, setBalanceRefreshDisabled]);

  // One-time user gesture to unlock WebAudio + start preloading number sounds
  // (PlayerLayoutClient also installs this globally for the player shell.)

  // Start background music when entering LiveRoom, stop when leaving
  useEffect(() => {
    if (!isMusicEnabled()) {
      stopLiveRoomMusic();
      return;
    }
    playLiveRoomMusic();
    return () => {
      stopLiveRoomMusic();
    };
  }, []);

  // لود اسنپ‌شات اولیه
  useEffect(() => {
    let isMounted = true;

    async function loadSnapshot() {
      if (!roomId || isHardExiting()) return;
      setLoading(true);
      try {
        console.log("[LiveRoom] loading snapshot for room", roomId);
        const snapshot = await fetchLiveRoomSnapshot(roomId);
        if (!isMounted) return;

        roomStatusRef.current = (snapshot.room.status || "")
          .trim()
          .toLowerCase();
        setData(snapshot);
        markDrawSynced();
        setError(null);

        console.log(
          "[LiveRoom] snapshot loaded, draws:",
          snapshot.draws.map((d) => d.number)
        );

        if (
          isMounted &&
          PLAYING_ROOM_STATUSES.has(
            (snapshot.room.status || "").trim().toLowerCase()
          ) &&
          snapshot.draws.length === 0
        ) {
          void runDrawSyncPollRef.current();
        }

        if (isMounted) {
          markRealtimeActivityRef.current();
          await syncWinnersFromApiRef.current(snapshot);
        }
      } catch (err: any) {
        console.error("[LiveRoom] snapshot load error:", err);
        if (isMounted) {
          setError(err.message || "خطا در بارگذاری اطلاعات بازی");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadSnapshot();

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  useEffect(() => {
    roomStatusRef.current = (data?.room?.status || "").trim().toLowerCase();
  }, [data?.room?.status]);

  // watchdog draw: در playing اگر ریل‌تایم draw نیامد، ~draw_interval+1.5s poll
  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled || isHardExiting()) return;
      const status = roomStatusRef.current;
      if (!PLAYING_ROOM_STATUSES.has(status)) return;

      const staleMs =
        drawIntervalSecRef.current * 1000 + DRAW_SYNC_BUFFER_MS;
      if (Date.now() - lastDrawSyncAtRef.current >= staleMs) {
        void runDrawSyncPollRef.current();
      }
    };

    const interval = setInterval(tick, DRAW_WATCHDOG_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  // watchdog کامل: status/winners/cards — ۱۲ ثانیه سکوت
  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled || isHardExiting()) return;
      const elapsed = Date.now() - lastRealtimeActivityRef.current;
      if (elapsed >= REALTIME_STALE_MS) {
        void runFallbackPollRef.current();
      }
    };

    const interval = setInterval(tick, REALTIME_WATCHDOG_TICK_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId]);

  // ریل‌تایم: draws + rooms + results (بعد از setAuth)
  useEffect(() => {
    if (!roomId || !session.authReady) return;

    console.log("[LiveRoom] realtime useEffect mount for room", roomId);

    let cancelled = false;
    let hadSubscribed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const applyProcessedDraw = (payload: {
      old?: Record<string, unknown>;
      new: Record<string, unknown>;
    }) => {
      const newProcessed = payload.new?.processed_at ?? null;
      const oldProcessed = payload.old?.processed_at ?? null;
      const number = payload.new?.number as number | undefined;
      const drawId = payload.new?.id as string | undefined;

      if (number == null) return;
      if (!newProcessed) {
        markRealtimeActivityRef.current();
        return;
      }
      // Only react when processed_at is newly set (ignore actor timing column updates).
      if (oldProcessed != null) return;

      const prev = dataRef.current;
      const alreadyPending = pendingRtDrawsRef.current.some(
        (d) => d.id === drawId || d.number === number
      );
      if (
        prev?.draws?.some((d) => d.id === drawId || d.number === number) ||
        alreadyPending
      ) {
        markDrawSync();
        markRealtimeActivityRef.current();
        return;
      }

      console.log("[LiveRoom] RT draw processed", { number, drawId });

      const processedAt =
        typeof newProcessed === "string" ? newProcessed : null;
      if (!processedAt) {
        void runDrawSyncPollRef.current();
        return;
      }

      const createdAt =
        (payload.new?.created_at as string | undefined) ||
        (payload.new?.timestamp as string | undefined) ||
        processedAt;

      const incomingDraw: ProcessedDraw = {
        id: drawId,
        number,
        created_at: createdAt,
        processed_at: processedAt,
      };

      if (!prev) {
        void runDrawSyncPollRef.current();
        return;
      }

      if (pollInFlightRef.current) {
        pendingRtDrawsRef.current = mergeDrawLists(pendingRtDrawsRef.current, [
          incomingDraw,
        ]);
        const mergedDraws = mergeDrawLists(prev.draws, [incomingDraw]);
        const nextSnapshot = { ...prev, draws: mergedDraws };
        dataRef.current = nextSnapshot;
        markDrawSync();
        markRealtimeActivityRef.current();
        console.log("[LiveRoom] RT draw deferred (poll in-flight)", {
          number,
          drawId,
        });
        return;
      }

      const draws = mergeDrawLists(prev.draws, [incomingDraw]);
      const nextSnapshot = { ...prev, draws };
      dataRef.current = nextSnapshot;
      setData(nextSnapshot);
      markDrawSync();
      markRealtimeActivityRef.current();
    };

    async function subscribeRealtime() {
      try {
        if (session.accessToken) {
          await supabase.realtime.setAuth(session.accessToken);
        } else {
          await supabase.realtime.setAuth(null);
        }
      } catch (err) {
        console.warn("[LiveRoom] realtime setAuth failed:", err);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`live-room-${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "draws",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            applyProcessedDraw(
              payload as {
                old?: Record<string, unknown>;
                new: Record<string, unknown>;
              }
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "draws",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            applyProcessedDraw({ new: payload.new as Record<string, unknown> });
          }
        )
        // تغییر status در rooms (waiting/playing/settling/finished)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            const oldStatus = (payload.old as any)?.status;
            const newStatus = (payload.new as any)?.status;
            if (!newStatus || oldStatus === newStatus) return;

            markRealtimeActivityRef.current();

            console.log(
              "[LiveRoom] rooms realtime status update",
              oldStatus,
              "→",
              newStatus
            );

            // اگر بازی جدید شروع شد (از finished به waiting/running)، lineWinners را reset کن
            const isNewGame =
              (oldStatus === "finished" || oldStatus === "settled") &&
              (newStatus === "waiting" ||
                newStatus === "running" ||
                newStatus === "playing");

            if (isNewGame) {
              console.log("[LiveRoom] New game started, resetting winners");
              setLineWinners([]);
              setFullWinners([]);
            }

            setData((prev) =>
              prev
                ? {
                    ...prev,
                    room: { ...prev.room, status: newStatus },
                  }
                : prev
            );
          }
        )
        // برنده‌ها (line / full)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "results",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            console.log("[LiveRoom] results realtime payload", payload);
            const newRow = payload.new as any;
            if (!newRow) return;

            markRealtimeActivityRef.current();

            if (newRow.win_type === "line") {
              const rawDraw = newRow.draw_number ?? newRow.draw;
              const entry: LineWinner = {
                ticketId: newRow.ticket_id,
                userId: newRow.user_id,
                drawNumber:
                  rawDraw === null || rawDraw === undefined
                    ? 0
                    : Number(rawDraw),
              };

              setLineWinners((prev) => {
                if (prev.some((w) => w.ticketId === entry.ticketId)) return prev;
                const next = [...prev, entry];
                console.log("[LiveRoom] lineWinners updated →", next);
                return next;
              });
              return;
            }

            if (newRow.win_type === "full") {
              const rawDraw = newRow.draw_number ?? newRow.draw;
              const fullEntry: FullWinner = {
                ticketId: newRow.ticket_id,
                userId: newRow.user_id,
                drawNumber:
                  rawDraw === null || rawDraw === undefined
                    ? 0
                    : Number(rawDraw),
              };

              setFullWinners((prev) => {
                if (prev.some((w) => w.ticketId === fullEntry.ticketId))
                  return prev;
                const next = [...prev, fullEntry];
                console.log("[LiveRoom] fullWinners updated →", next);
                return next;
              });

              console.log("[LiveRoom] full win detected");
            }
          }
        );

      channel.subscribe((status) => {
        if (cancelled) return;
        console.log("[LiveRoom] channel status:", status);
        if (status === "SUBSCRIBED") {
          if (hadSubscribed) {
            console.log("[LiveRoom] channel reconnected → catch-up poll");
            void runFallbackPollRef.current();
          }
          hadSubscribed = true;
        } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          console.warn("[LiveRoom] channel error, scheduling fallback poll");
          void runDrawSyncPollRef.current();
        }
      });
    }

    void subscribeRealtime();

    return () => {
      cancelled = true;
      console.log("[LiveRoom] cleanup realtime for room", roomId);
      if (channel) {
        try {
          channel.unsubscribe();
        } catch {
          // ignore
        }
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [roomId, session.authReady, session.tokenVersion, session.accessToken]);

  // userId فعلی
  const currentUserId = useMemo(() => {
    if (!data) return null;
    const mine = data.cards.find((c) => c.is_my_card && c.player_id);
    return mine?.player_id ?? null;
  }, [data]);

  // status از realtime/fallback به settling|finished رسید
  useEffect(() => {
    const status = (data?.room.status || "").trim().toLowerCase();
    const isFinished =
      status !== "" &&
      !["running", "playing", "live", "waiting"].includes(status);

    if (!isFinished) return;

    console.log("[LiveRoom] room finished with status:", status);
    scheduleWalletBalanceSync?.(`room-finished:${roomId}`);
    void refreshAllBalances?.();
    invalidateActiveGames?.();
  }, [
    data?.room.status,
    roomId,
    scheduleWalletBalanceSync,
    refreshAllBalances,
    invalidateActiveGames,
  ]);

  // ---- رندر ----

  if (loading && !data) {
    return (
      <div className={`${loadingStyles.page} ${loadingStyles.pageCentered}`}>
        <div className={loadingStyles.spinner} aria-hidden="true" />
        <p className={loadingStyles.message}>در حال بارگذاری بازی زنده...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className={`${loadingStyles.page} ${loadingStyles.pageCentered}`}>
        <p className={loadingStyles.message}>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  const latestNumber = displayedCalledNumbers.length
    ? displayedCalledNumbers[displayedCalledNumbers.length - 1]
    : null;
  const previousNumbers = displayedCalledNumbers.slice(0, -1).reverse();

  const normalizeCommissionRate = (value: number | null | undefined) => {
    if (!value || Number.isNaN(value)) return 0;
    if (value < 0) return 0;
    return value;
  };

  const normalizePrizeSplits = (
    linePctRaw: number | null | undefined,
    fullPctRaw: number | null | undefined
  ) => {
    let linePct =
      linePctRaw === null || linePctRaw === undefined ? 0.5 : linePctRaw;
    let fullPct =
      fullPctRaw === null || fullPctRaw === undefined ? 0.5 : fullPctRaw;

    if (linePct === 0 && fullPct === 0) {
      linePct = 0.5;
      fullPct = 0.5;
    }

    const sum = linePct + fullPct;
    if (sum > 1) {
      linePct = linePct / sum;
      fullPct = 1 - linePct;
    }

    return {
      linePct: Math.max(linePct, 0),
      fullPct: Math.max(fullPct, 0),
    };
  };

  const roundToCurrency = (value: number) => Number(value.toFixed(2));

  const cardPrice = Number(data.room.card_price || 0);
  const cardCount = data.cards.length;
  const commissionRate = normalizeCommissionRate(data.room.commission_rate);
  const perTicketCommission = Math.ceil(cardPrice * commissionRate);
  const perTicketPool = Math.max(cardPrice - perTicketCommission, 0);
  const totalPool = perTicketPool * cardCount;
  const { linePct, fullPct } = normalizePrizeSplits(
    data.room.line_reward_percentage,
    data.room.full_reward_percentage
  );
  const linePrize = roundToCurrency(totalPool * linePct);
  const fullPrize = roundToCurrency(Math.max(totalPool - linePrize, 0));
  const roomName = data.room.room_code || `اتاق ${data.room.card_price}`;
  const roomCommitHash = (data.room as any)?.room_seed_hash ?? null;
  const orderedCards = [...data.cards].sort(
    (a, b) => Number(b.is_my_card) - Number(a.is_my_card)
  );

  const hasRevealedLineWinner =
    !data.tournament?.id &&
    lineWinners.some(
      (w) => w.drawNumber == null || displayedCalledNumbers.includes(w.drawNumber)
    );

  const hasRevealedFullWinner = fullWinners.some(
    (w) =>
      w.drawNumber == null ||
      w.drawNumber === 0 ||
      displayedCalledNumbers.includes(w.drawNumber)
  );

  const winningFullDrawNumber =
    fullWinners.find((w) => w.drawNumber != null && w.drawNumber > 0)
      ?.drawNumber ?? null;

  return (
    <div className={styles.root}>
      <div className="max-w-3xl mx-auto h-full flex flex-col">
        {/* RoomHeader Section - Fixed, doesn't scroll */}
        <div className="flex-shrink-0 px-4 pt-2 pb-1">
          <div
            className="rounded-2xl overflow-hidden bg-cover bg-center bg-no-repeat p-2 flex flex-col gap-1"
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.28)), url(${gameHeaderBg.src})`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center center",
              backgroundSize: "100% 100%",
            }}
          >
            <RoomHeader
              linePrize={linePrize}
              fullPrize={fullPrize}
              isTournament={!!data.tournament?.id}
              tournamentName={data.tournament?.title ?? null}
              roundNumber={data.tournament?.round_no ?? null}
              hasLineWinner={hasRevealedLineWinner}
              hasFullWinner={hasRevealedFullWinner}
            />

            <DrawStrip
              roomName={roomName}
              showRoomBadge={false}
              commitHash={roomCommitHash}
              currentNumber={latestNumber ?? null}
              history={previousNumbers}
              totalDraws={authoritativeCalledNumbers.length}
              countdownSeconds={latestNumber == null ? firstDrawCountdownSec : null}
              winningFullDrawNumber={winningFullDrawNumber}
            />
          </div>

          {error && (
            <div className="mt-1 bg-red-500/20 border border-red-500 text-red-200 rounded-2xl p-3 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Cards List Section - Scrollable */}
        <div
          className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-[9px] space-y-2 pr-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ paddingBottom: "300px" }}
        >
          {orderedCards.map((card) => (
            <div key={card.ticket_id} className="bg-transparent rounded-3xl">
              <BingoCardDemo
                ticketId={card.ticket_id}
                calledNumbers={displayedCalledNumbers}
                playerName={card.is_my_card ? "کارت های من" : card.player_name}
                cardNumber={card.card_number ?? undefined}
                size="large"
                isMyCard={card.is_my_card}
                linePrize={true}
                lineWinners={data.tournament?.id ? [] : lineWinners}
                fullWinners={fullWinners}
                cardData={card.card}
              />
            </div>
          ))}
        </div>
      </div>

      <GameResultsDialog
        isOpen={showResultsDialog}
        onClose={() => {
          setShowResultsDialog(false);
          const tournamentId = results?.tournamentId ?? null;
          const destination =
            results?.isTournament && tournamentId
              ? `/player/tournaments/${tournamentId}?tournamentId=${tournamentId}&templateId=${tournamentId}`
              : "/player/lobby";
          router.push(destination);
        }}
        title={
          <span dir="rtl">
            نتیجه بازی شماره :{" "}
            <span dir="ltr" className="latin-number">
              {roomName}
            </span>
          </span>
        }
        proofSeed={results?.seed ?? null}
        proofCommitHash={results?.commitHash ?? null}
        drawVerification={results?.drawVerification ?? null}
        currentUserId={currentUserId}
        lineWinners={results?.lineWinners ?? []}
        fullWinners={results?.fullWinners ?? []}
        isTournament={results?.isTournament ?? false}
      />
    </div>
  );
}
