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
import { playNumber, unlockAndPreloadOnUserGesture } from "@/lib/number-audio";
import { playLiveRoomMusic, stopLiveRoomMusic } from "@/lib/audio/music";
import { isMusicEnabled } from "@/lib/audio-settings";
import { useDrawRevealQueue } from "@/lib/hooks/useDrawRevealQueue";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";

type LineWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

interface LiveRoomScreenProps {
  roomId: string;
}

/** اگر این مدت هیچ draw sync نشد (ریل‌تایم + poll)، یک بار draw poll می‌زنیم. */
const DRAW_SYNC_BUFFER_MS = 1500;
const DEFAULT_DRAW_INTERVAL_SEC = 3;
/** fallback کامل snapshot (status/winners) */
const REALTIME_STALE_MS = 12_000;
const REALTIME_WATCHDOG_TICK_MS = 2_000;
const DRAW_WATCHDOG_TICK_MS = 1_000;

const ACTIVE_ROOM_STATUSES = new Set([
  "waiting",
  "running",
  "playing",
  "live",
  "settling",
]);

const PLAYING_ROOM_STATUSES = new Set(["running", "playing", "live"]);

function mapLineWinnersFromApi(
  winners: RoomResultsResponse["lineWinners"],
  cards: LiveRoomSnapshot["cards"]
): LineWinner[] {
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
    .filter((w): w is LineWinner => w !== null);
}

function lineWinnersEqual(a: LineWinner[], b: LineWinner[]): boolean {
  if (a.length !== b.length) return false;
  const key = (w: LineWinner) => `${w.ticketId}:${w.drawNumber}`;
  const setA = new Set(a.map(key));
  return b.every((w) => setA.has(key(w)));
}

export default function LiveRoomScreen({ roomId }: LiveRoomScreenProps) {
  const router = useRouter();
  const { setShowStatusBar, setBalanceRefreshDisabled } = useHeaderVisibility();
  const { creditDingOnReveal, scheduleWalletBalanceSync, refreshAllBalances } =
    useBalancesContext();
  const { invalidate: invalidateActiveGames } = useActiveGamesContext();

  const [data, setData] = useState<LiveRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [lineWinners, setLineWinners] = useState<LineWinner[]>([]);

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

  const tryOpenResultsDialog = useCallback(async () => {
    if (resultsRequestedRef.current || openingResultsRef.current) return;

    const key = buildGameResultsKey({
      roomName: roomId,
      status: "finished",
      finishedAtHint: null,
    });
    if (hasSeenGameResults(key)) return;

    openingResultsRef.current = true;
    resultsRequestedRef.current = true;
    setResultsRequested(true);

    try {
      const res = await fetchRoomResultsWhenPrizesReady(roomId);
      setResults(res);
      setShowResultsDialog(true);
      markSeenGameResults(key);
      scheduleWalletBalanceSync?.(`room-settled:${roomId}`);
    } catch (err) {
      console.error("[LiveRoom] winners fetch error:", err);
      setShowResultsDialog(true);
      markSeenGameResults(key);
    } finally {
      openingResultsRef.current = false;
    }
  }, [roomId, scheduleWalletBalanceSync]);

  const syncLineWinnersFromApi = useCallback(
    async (snapshot: LiveRoomSnapshot | null | undefined) => {
      if (!snapshot) return;
      if (snapshot.tournament?.id) {
        setLineWinners([]);
        return;
      }
      try {
        const roomResults = await fetchRoomResults(roomId);
        const next = mapLineWinnersFromApi(
          roomResults.lineWinners,
          snapshot.cards
        );
        setLineWinners((prev) =>
          lineWinnersEqual(prev, next) ? prev : next
        );
      } catch (err) {
        console.warn("[LiveRoom] line winners sync failed:", err);
      }
    },
    [roomId]
  );

  const syncLineWinnersFromApiRef = useRef(syncLineWinnersFromApi);
  useEffect(() => {
    syncLineWinnersFromApiRef.current = syncLineWinnersFromApi;
  }, [syncLineWinnersFromApi]);

  // Countdown تا اولین draw (نمایش در جای عدد current در DrawStrip وقتی هنوز عددی نداریم)
  const [firstDrawCountdownSec, setFirstDrawCountdownSec] = useState<number | null>(null);
  const serverOffsetRef = useRef<number>(0);

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

  const revealIntervalMs = Math.max(
    (data?.room?.draw_interval_sec ?? DEFAULT_DRAW_INTERVAL_SEC) * 1000,
    1000
  );

  const handleDrawReveal = useCallback(
    (number: number) => {
      void playNumber(number);
      creditDingForRevealedNumber(number, dataRef.current);
      void syncLineWinnersFromApiRef.current(dataRef.current);
    },
    [creditDingForRevealedNumber]
  );

  const { calledNumbers, syncFromServer, reset: resetDrawReveal } =
    useDrawRevealQueue(revealIntervalMs, handleDrawReveal);

  useEffect(() => {
    drawIntervalSecRef.current =
      data?.room?.draw_interval_sec ?? DEFAULT_DRAW_INTERVAL_SEC;
  }, [data?.room?.draw_interval_sec]);

  const syncFromServerRef = useRef(syncFromServer);
  useEffect(() => {
    syncFromServerRef.current = syncFromServer;
  }, [syncFromServer]);

  const markRealtimeActivity = useCallback(() => {
    lastRealtimeActivityRef.current = Date.now();
  }, []);

  const markDrawSync = useCallback(() => {
    const now = Date.now();
    lastDrawSyncAtRef.current = now;
    lastRealtimeActivityRef.current = now;
  }, []);

  const applyDrawsFromSnapshot = useCallback(
    (draws: LiveRoomSnapshot["draws"]) => {
      syncFromServer(draws);
      markDrawSync();
    },
    [syncFromServer, markDrawSync]
  );

  const runDrawSyncPoll = useCallback(async () => {
    if (!roomId || pollInFlightRef.current) return;

    const status = roomStatusRef.current;
    if (!PLAYING_ROOM_STATUSES.has(status)) return;

    pollInFlightRef.current = true;
    try {
      const snapshot = await fetchLiveRoomSnapshot(roomId);
      roomStatusRef.current = (snapshot.room.status || "").trim().toLowerCase();
      setData((prev) =>
        prev
          ? {
              ...prev,
              room: {
                ...prev.room,
                status: snapshot.room.status,
                next_draw_at: snapshot.room.next_draw_at ?? null,
                draw_interval_sec: snapshot.room.draw_interval_sec,
                ding_per_number: snapshot.room.ding_per_number,
              },
              server_now: snapshot.server_now,
            }
          : snapshot
      );
      applyDrawsFromSnapshot(snapshot.draws);
      await syncLineWinnersFromApi(snapshot);
      console.log("[LiveRoom] draw sync poll (realtime draw stale)");
    } catch (err) {
      console.warn("[LiveRoom] draw sync poll error:", err);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [roomId, applyDrawsFromSnapshot, syncLineWinnersFromApi]);

  const applyDrawsFromSnapshotRef = useRef(applyDrawsFromSnapshot);
  useEffect(() => {
    applyDrawsFromSnapshotRef.current = applyDrawsFromSnapshot;
  }, [applyDrawsFromSnapshot]);

  const runDrawSyncPollRef = useRef(runDrawSyncPoll);
  useEffect(() => {
    runDrawSyncPollRef.current = runDrawSyncPoll;
  }, [runDrawSyncPoll]);

  const runFallbackPoll = useCallback(async () => {
    if (!roomId || pollInFlightRef.current) return;

    const status = roomStatusRef.current;
    if (status && !ACTIVE_ROOM_STATUSES.has(status)) return;

    pollInFlightRef.current = true;
    try {
      const snapshot = await fetchLiveRoomSnapshot(roomId);
      const nextStatus = (snapshot.room.status || "").trim().toLowerCase();
      roomStatusRef.current = nextStatus;
      setData(snapshot);
      applyDrawsFromSnapshot(snapshot.draws);

      const isTerminal = ["settling", "finished", "cancelled"].includes(
        nextStatus
      );
      await syncLineWinnersFromApi(snapshot);
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
    applyDrawsFromSnapshot,
    syncLineWinnersFromApi,
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

  // state پاپ‌آپ و صف نمایش اعداد با عوض شدن room ریست شود
  useEffect(() => {
    resetDrawReveal();
    setResultsRequested(false);
    setShowResultsDialog(false);
    setResults(null);
    resultsRequestedRef.current = false;
    openingResultsRef.current = false;
    lastRealtimeActivityRef.current = Date.now();
    lastDrawSyncAtRef.current = Date.now();
    roomStatusRef.current = "";
  }, [roomId, resetDrawReveal]);

  // محاسبه و آپدیت countdown تا اولین draw بر اساس next_draw_at و server_now
  useEffect(() => {
    // فقط وقتی هنوز هیچ عددی نیومده (draw اول)
    if (calledNumbers.length > 0) {
      setFirstDrawCountdownSec(null);
      return;
    }

    const nextDrawAt = data?.room?.next_draw_at ?? null;
    const serverNowIso = data?.server_now ?? null;

    if (!nextDrawAt || !serverNowIso) {
      setFirstDrawCountdownSec(null);
      return;
    }

    const serverNowMs = new Date(serverNowIso).getTime();
    const clientNowMs = Date.now();
    serverOffsetRef.current = serverNowMs - clientNowMs;

    const deadlineMs = new Date(nextDrawAt).getTime();

    const tick = () => {
      const now = Date.now() + serverOffsetRef.current;
      const remainingMs = deadlineMs - now;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      // صفر هم نمایش داده شود (به‌جای اینکه null شود)
      setFirstDrawCountdownSec(remainingSec);
    };

    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [calledNumbers.length, data?.room?.next_draw_at, data?.server_now]);

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
  useEffect(() => {
    const cleanup = unlockAndPreloadOnUserGesture(window);
    return cleanup;
  }, []);

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
      if (!roomId) return;
      setLoading(true);
      try {
        console.log("[LiveRoom] loading snapshot for room", roomId);
        const snapshot = await fetchLiveRoomSnapshot(roomId);
        if (!isMounted) return;

        setData(snapshot);
        applyDrawsFromSnapshot(snapshot.draws);
        setError(null);

        console.log(
          "[LiveRoom] snapshot loaded, draws:",
          snapshot.draws.map((d) => d.number)
        );

        if (isMounted) {
          roomStatusRef.current = (snapshot.room.status || "")
            .trim()
            .toLowerCase();
          markRealtimeActivity();
          await syncLineWinnersFromApi(snapshot);
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
  }, [roomId, applyDrawsFromSnapshot, syncLineWinnersFromApi, markRealtimeActivity]);

  useEffect(() => {
    roomStatusRef.current = (data?.room?.status || "").trim().toLowerCase();
  }, [data?.room?.status]);

  // watchdog draw: در playing اگر ریل‌تایم draw نیامد، ~draw_interval+1.5s poll
  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
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
      if (cancelled) return;
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

  // ریل‌تایم: draws + rooms + results
  useEffect(() => {
    if (!roomId) return;

    console.log("[LiveRoom] realtime useEffect mount for room", roomId);

    let hadSubscribed = false;

    const handleDrawUpdate = (payload: {
      old: Record<string, unknown>;
      new: Record<string, unknown>;
    }) => {
      const rowRoomId = payload.new?.room_id as string | undefined;
      if (rowRoomId !== roomId) return;

      const oldProcessed = payload.old?.processed_at ?? null;
      const newProcessed = payload.new?.processed_at ?? null;
      const number = payload.new?.number as number | undefined;
      const drawId = payload.new?.id as string | undefined;

      console.log("[LiveRoom] RT draw payload", {
        number,
        oldProcessed,
        newProcessed,
        drawId,
      });

      if (oldProcessed !== null && oldProcessed !== undefined) return;
      if (!newProcessed) return;
      if (number == null) return;

      const createdAt =
        (payload.new?.created_at as string | undefined) ||
        (payload.new?.timestamp as string | undefined) ||
        new Date().toISOString();

      setData((prev) => {
        if (!prev) return prev;
        if (prev.draws.some((d) => d.number === number)) return prev;

        return {
          ...prev,
          draws: [...prev.draws, { number, created_at: createdAt }],
        };
      });

      applyDrawsFromSnapshotRef.current([{ number, created_at: createdAt }]);
      void syncLineWinnersFromApiRef.current(dataRef.current);
    };

    const channel = supabase
      .channel(`live-room-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "draws",
        },
        (payload) => {
          handleDrawUpdate(payload as { old: Record<string, unknown>; new: Record<string, unknown> });
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
            (newStatus === "waiting" || newStatus === "running" || newStatus === "playing");
          
          if (isNewGame) {
            console.log("[LiveRoom] New game started, resetting lineWinners");
            setLineWinners([]);
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
            console.log("[LiveRoom] full win detected → open results");
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    room: { ...prev.room, status: "finished" },
                  }
                : prev
            );
            void tryOpenResultsDialog();
          }
        }
      );

    const subscription = channel.subscribe((status) => {
      console.log("[LiveRoom] channel status:", status);
      if (status === "SUBSCRIBED") {
        if (hadSubscribed) {
          console.log("[LiveRoom] channel reconnected → catch-up poll");
          void runFallbackPollRef.current();
        }
        hadSubscribed = true;
      }
    });

    return () => {
      console.log("[LiveRoom] cleanup realtime for room", roomId);
      try {
        subscription.unsubscribe?.();
      } catch {
        // ignore
      }
      supabase.removeChannel(channel);
    };
  }, [roomId, tryOpenResultsDialog]);

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
    void tryOpenResultsDialog();
  }, [
    data?.room.status,
    roomId,
    scheduleWalletBalanceSync,
    refreshAllBalances,
    tryOpenResultsDialog,
    invalidateActiveGames,
  ]);

  // ---- رندر ----

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/40 text-white">
        در حال بارگذاری بازی زنده...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black/40 text-white">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const latestNumber = calledNumbers.length
    ? calledNumbers[calledNumbers.length - 1]
    : null;
  const previousNumbers = calledNumbers.slice(0, -1).reverse();

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
      (w) => w.drawNumber == null || calledNumbers.includes(w.drawNumber)
    );

  return (
    <div className="h-full bg-black/40 text-white overflow-hidden">
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
            />

            <DrawStrip
              roomName={roomName}
              showRoomBadge={false}
              commitHash={roomCommitHash}
              currentNumber={latestNumber ?? null}
              history={previousNumbers}
              totalDraws={calledNumbers.length}
              countdownSeconds={latestNumber == null ? firstDrawCountdownSec : null}
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
          className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-[9px] space-y-2 pr-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          style={{ paddingBottom: "300px" }}
        >
          {orderedCards.map((card) => (
            <div key={card.ticket_id} className="bg-transparent rounded-3xl">
              <BingoCardDemo
                ticketId={card.ticket_id}
                calledNumbers={calledNumbers}
                playerName={card.is_my_card ? "کارت های من" : card.player_name}
                cardNumber={card.card_number ?? undefined}
                size="large"
                isMyCard={card.is_my_card}
                linePrize={true}
                lineWinners={data.tournament?.id ? [] : lineWinners}
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
        proofSeed={(results as any)?.seed ?? null}
        proofCommitHash={(results as any)?.commitHash ?? null}
        currentUserId={currentUserId}
        lineWinners={results?.lineWinners ?? []}
        fullWinners={results?.fullWinners ?? []}
        isTournament={results?.isTournament ?? false}
      />
    </div>
  );
}
