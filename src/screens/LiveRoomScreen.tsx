"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchLiveRoomSnapshot,
  type LiveRoomSnapshot,
  fetchRoomResults,
  fetchRoomResultsWhenPrizesReady,
  type RoomResultsResponse,
} from "@/services/rooms";
import {
  fetchWatchLiveRoomSnapshot,
  fetchWatchRoomResults,
  fetchWatchRoomResultsWhenPrizesReady,
} from "@/services/watchRooms";
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
import {
  buildPerDrawRevealCredit,
  resolveDingSettleMode,
  shouldPlayDingToneOnLiveReveal,
} from "@/lib/liveRoom/liveDingUi";
import { playNumber } from "@/lib/number-audio";
import { playLiveRoomMusic, stopLiveRoomMusic } from "@/lib/audio/music";
import { isMusicEnabled } from "@/lib/audio-settings";
import {
  mergeDrawLists,
  orderDrawsForLiveRoom,
  type ProcessedDraw,
} from "@/lib/draw-order";
import {
  applyLiveRoomSnapshotUpdate,
  isManifestRamEngineOnlyPhase,
  resolveDrawSource,
  shouldRewindRevealCursor,
  shouldSyncWinnersDisplayFromDb,
  shouldUsePgLiveDrawUpdates,
} from "@/lib/liveRoom/engineRamSnapshot";
import { resolveDisplayLineWinners } from "@/lib/liveRoom/deriveLiveWinners";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import { useSession } from "@/lib/contexts/SessionContext";
import { isHardExiting } from "@/lib/auth/hardExit";
import { shouldUseDrawsOnlyLiveRoomFallback } from "@/lib/cardPool/client";
import {
  buildLiveRoomShell,
  persistLiveRoomShellCache,
} from "@/lib/liveRoom/liveRoomShell";
import { useFeatures } from "@/lib/featureFlags/useFeatures";
import { GAME_ROOM_CARD_OVERLAY_FEATURE_KEY } from "@/lib/liveRoom/featureKeys";
import styles from "./LiveRoomScreen.module.css";

const CARD_INFO_TOGGLE_MOVE_PX = 10;

type CardWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

type LineWinner = CardWinner;
type FullWinner = CardWinner;

interface LiveRoomScreenProps {
  roomId: string;
  onResolvedTournamentId?: (tournamentId: string | null) => void;
  guestSpectate?: {
    watchCode: number;
    backPath: string;
  };
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
/** بعد از نمایش آخرین عدد در UI، قبل از بنر پایان بازی. */
const RESULTS_BANNER_DELAY_MS = 6_000;

const ACTIVE_ROOM_STATUSES = new Set([
  "waiting",
  "running",
  "playing",
  "live",
  "settling",
]);

const PLAYING_ROOM_STATUSES = new Set(["running", "playing", "live"]);

function isRoomTerminalStatus(status: string): boolean {
  const normalized = (status || "").trim().toLowerCase();
  return (
    normalized !== "" &&
    !["running", "playing", "live", "waiting"].includes(normalized)
  );
}

function takePendingDrawsForSnapshot(
  snapshot: LiveRoomSnapshot | null | undefined,
  pendingRef: { current: ProcessedDraw[] }
): ProcessedDraw[] {
  if (!shouldUsePgLiveDrawUpdates(snapshot)) {
    pendingRef.current = [];
    return [];
  }
  const pending = pendingRef.current;
  pendingRef.current = [];
  return pending;
}

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

export default function LiveRoomScreen({
  roomId,
  onResolvedTournamentId,
  guestSpectate,
}: LiveRoomScreenProps) {
  const isGuestSpectate = Boolean(guestSpectate);
  const router = useRouter();
  const session = useSession();
  const { setShowStatusBar, setBalanceRefreshDisabled, setFullPageScroll } =
    useHeaderVisibility();
  const {
    creditDingOnReveal,
    triggerDingCelebrate,
    setLiveDingSettleMode,
    applySettledDingBalance,
    scheduleWalletBalanceSync,
    refreshAllBalances,
  } = useBalancesContext();
  const { invalidate: invalidateActiveGames } = useActiveGamesContext();

  const fetchSnapshot = useCallback(
    (
      targetRoomId: string,
      options?: { scope?: "full" | "draws"; engineOnly?: boolean }
    ) => {
      if (guestSpectate) {
        return fetchWatchLiveRoomSnapshot(
          guestSpectate.watchCode,
          targetRoomId,
          options
        );
      }
      return fetchLiveRoomSnapshot(targetRoomId, options);
    },
    [guestSpectate]
  );

  const resolveEngineOnlyFetch = useCallback((): boolean => {
    return isManifestRamEngineOnlyPhase(dataRef.current);
  }, []);

  const fetchResultsSnapshot = useCallback(
    (targetRoomId: string) => {
      if (guestSpectate) {
        return fetchWatchRoomResults(guestSpectate.watchCode, targetRoomId);
      }
      return fetchRoomResults(targetRoomId);
    },
    [guestSpectate]
  );

  const fetchResultsWhenReady = useCallback(
    (
      targetRoomId: string,
      options?: { maxAttempts?: number; delayMs?: number }
    ) => {
      if (guestSpectate) {
        return fetchWatchRoomResultsWhenPrizesReady(guestSpectate.watchCode, targetRoomId);
      }
      return fetchRoomResultsWhenPrizesReady(targetRoomId, options);
    },
    [guestSpectate]
  );

  const [data, setData] = useState<LiveRoomSnapshot>(() =>
    buildLiveRoomShell(roomId).snapshot
  );
  const [error, setError] = useState<string | null>(null);
  const [hasLiveSnapshot, setHasLiveSnapshot] = useState(false);

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
  const cardPoolMetaRef = useRef<LiveRoomSnapshot["card_pool"]>(null);
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
  const resultsDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultsDelayResolveRef = useRef<(() => void) | null>(null);
  const resultsOpenGenerationRef = useRef(0);
  /** First snapshot was already finished — watching a replay, not a live ending. */
  const replayModeRef = useRef(false);
  /** RT draws received while a draw poll is in-flight (merged when poll completes). */
  const pendingRtDrawsRef = useRef<ProcessedDraw[]>([]);
  const lastEventSeqRef = useRef<number | null>(null);
  const winnersSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const tryOpenResultsDialog = useCallback(async () => {
    if (replayModeRef.current) {
      console.log("[LiveRoom] Skip results dialog (replay)", { roomId });
      return;
    }
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

    const generation = ++resultsOpenGenerationRef.current;
    openingResultsRef.current = true;
    resultsRequestedRef.current = true;
    setResultsRequested(true);

    const isTournamentRoom = !!dataRef.current?.tournament?.id;

    console.log("[LiveRoom] delaying results banner", {
      roomId,
      delayMs: RESULTS_BANNER_DELAY_MS,
    });

    const delayPromise = new Promise<void>((resolve) => {
      if (resultsDelayTimerRef.current) {
        clearTimeout(resultsDelayTimerRef.current);
      }
      resultsDelayResolveRef.current = resolve;
      resultsDelayTimerRef.current = setTimeout(() => {
        resultsDelayTimerRef.current = null;
        resultsDelayResolveRef.current = null;
        resolve();
      }, RESULTS_BANNER_DELAY_MS);
    });

    const fetchPromise = fetchResultsWhenReady(roomId, {
      maxAttempts: isTournamentRoom ? 10 : 30,
      delayMs: isTournamentRoom ? 200 : 500,
    }).then(
      (res) => ({ ok: true as const, res }),
      (err: unknown) => ({ ok: false as const, err })
    );

    try {
      const [fetched] = await Promise.all([fetchPromise, delayPromise]);

      if (generation !== resultsOpenGenerationRef.current) return;
      if (isHardExiting()) return;

      if (fetched.ok) {
        setResults(fetched.res);
        if (
          fetched.res.dingSettleMode === "room_level" &&
          fetched.res.dingSettled
        ) {
          applySettledDingBalance?.(fetched.res.dingBalanceAfterSettlement);
        }
        void refreshAllBalances?.({ force: true });
      } else {
        console.error("[LiveRoom] winners fetch error:", fetched.err);
      }
      setShowResultsDialog(true);
      markSeenGameResults(key);
      if (fetched.ok && !isTournamentRoom) {
        scheduleWalletBalanceSync?.(`room-settled:${roomId}`);
      }
    } finally {
      openingResultsRef.current = false;
    }
  }, [
    roomId,
    scheduleWalletBalanceSync,
    fetchResultsWhenReady,
    refreshAllBalances,
    applySettledDingBalance,
  ]);

  const syncWinnersFromApi = useCallback(
    async (snapshot: LiveRoomSnapshot | null | undefined) => {
      if (!snapshot || !shouldSyncWinnersDisplayFromDb(snapshot)) return;
      try {
        const roomResults = await fetchResultsSnapshot(roomId);
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
    [roomId, fetchResultsSnapshot]
  );

  const syncWinnersFromApiRef = useRef(syncWinnersFromApi);
  useEffect(() => {
    syncWinnersFromApiRef.current = syncWinnersFromApi;
  }, [syncWinnersFromApi]);

  useEffect(() => {
    if (!data) return;
    if (data.source !== "engine_ram" && data.room.gameplay_persist_mode !== "manifest_ram") {
      return;
    }
    if (data.line_winners) {
      const nextLine = data.line_winners.map((w) => ({
        ticketId: w.ticketId,
        userId: w.userId,
        drawNumber: w.drawNumber,
      }));
      setLineWinners((prev) => {
        if (cardWinnersEqual(prev, nextLine)) return prev;
        console.log("[LiveRoom] RAM line winners", nextLine);
        return nextLine;
      });
    }
    if (data.full_winners) {
      const nextFull = data.full_winners.map((w) => ({
        ticketId: w.ticketId,
        userId: w.userId,
        drawNumber: w.drawNumber,
      }));
      setFullWinners((prev) =>
        cardWinnersEqual(prev, nextFull) ? prev : nextFull
      );
    }
  }, [data]);

  // شمارش معکوس بصری تا اولین draw در DrawStrip (۵→…→۰، سپس ماندن روی ۰)
  const [firstDrawCountdownSec, setFirstDrawCountdownSec] = useState<number | null>(null);
  const { hasFeature, loading: featuresLoading, error: featuresError } = useFeatures();
  const overlayVariant =
    !featuresLoading &&
    !featuresError &&
    hasFeature(GAME_ROOM_CARD_OVERLAY_FEATURE_KEY);
  const [cardsInfoVisible, setCardsInfoVisible] = useState(false);
  const cardPointerStartYRef = useRef<number | null>(null);

  // برای استفاده داخل callback های realtime (جلوگیری از stale closure)
  const dataRef = useRef<LiveRoomSnapshot>(data);
  useEffect(() => {
    dataRef.current = data;
    setLiveDingSettleMode?.(resolveDingSettleMode(data?.room?.ding_settle_mode));
  }, [data, setLiveDingSettleMode]);

  useLayoutEffect(() => {
    const { snapshot } = buildLiveRoomShell(roomId);
    setData(snapshot);
    setHasLiveSnapshot(false);
    setError(null);
  }, [roomId]);

  const creditDingForPerDrawReveal = useCallback(
    (number: number, snapshot: LiveRoomSnapshot | null | undefined) => {
      const credit = buildPerDrawRevealCredit(snapshot, number);
      if (credit) {
        creditDingOnReveal?.(
          credit.revealKey,
          credit.delta,
          resolveDingSettleMode(snapshot?.room?.ding_settle_mode)
        );
        return;
      }
      // room_level: no mid-game ledger credit, but still play ding on own-card hits.
      if (!shouldPlayDingToneOnLiveReveal(snapshot, number)) return;
      console.log("[LiveRoom] ding tone (display-only)", {
        number,
        mode: snapshot?.room?.ding_settle_mode,
      });
      triggerDingCelebrate?.();
    },
    [creditDingOnReveal, triggerDingCelebrate]
  );

  const commitSnapshotUpdate = useCallback(
    (
      prev: LiveRoomSnapshot | null,
      incoming: LiveRoomSnapshot,
      pendingDraws: ProcessedDraw[] = []
    ): LiveRoomSnapshot | null => {
      const result = applyLiveRoomSnapshotUpdate(prev, incoming, { pendingDraws });
      if (!result.accepted) {
        console.warn("[LiveRoom] rejected stale engine_ram snapshot", {
          incomingEventSeq: incoming.eventSeq,
          lastEventSeq: lastEventSeqRef.current,
        });
        return prev;
      }
      if (result.snapshot.eventSeq != null) {
        lastEventSeqRef.current = result.snapshot.eventSeq;
      }
      return result.snapshot;
    },
    []
  );

  const liveDrawSource = resolveDrawSource(data);

  const authoritativeCalledNumbers = useMemo(
    () =>
      orderDrawsForLiveRoom(data?.draws ?? [], liveDrawSource).map(
        (d) => d.number
      ),
    [data?.draws, liveDrawSource]
  );

  const displayedCalledNumbers = useMemo(
    () => authoritativeCalledNumbers.slice(0, revealedDrawCount),
    [authoritativeCalledNumbers, revealedDrawCount]
  );

  const displayLineWinners = useMemo(
    () =>
      resolveDisplayLineWinners({
        snapshot: data,
        calledInOrder: displayedCalledNumbers,
        dbLineWinners: lineWinners,
      }),
    [data, displayedCalledNumbers, lineWinners]
  );

  const handleNewDraw = useCallback(
    (number: number) => {
      void playNumber(number);
      creditDingForPerDrawReveal(number, dataRef.current);
      if (!shouldSyncWinnersDisplayFromDb(dataRef.current)) return;
      if (winnersSyncDebounceRef.current) {
        clearTimeout(winnersSyncDebounceRef.current);
      }
      winnersSyncDebounceRef.current = setTimeout(() => {
        void syncWinnersFromApiRef.current(dataRef.current);
      }, 800);
    },
    [creditDingForPerDrawReveal]
  );

  const scheduleNextDrawReveal = useCallback(() => {
    if (revealTimerRef.current) return;

    const drawSource = resolveDrawSource(dataRef.current);
    const sorted = orderDrawsForLiveRoom(
      dataRef.current?.draws ?? [],
      drawSource
    );
    if (revealedDrawCountRef.current >= sorted.length) return;

    const intervalMs = Math.max(drawIntervalSecRef.current * 1000, 500);
    const elapsed = Date.now() - lastRevealAtRef.current;
    const delay = elapsed >= intervalMs ? 0 : intervalMs - elapsed;

    revealTimerRef.current = setTimeout(() => {
      revealTimerRef.current = null;
      const latestSorted = orderDrawsForLiveRoom(
        dataRef.current?.draws ?? [],
        resolveDrawSource(dataRef.current)
      );
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
    const drawSource = resolveDrawSource(data);
    const authCount = orderDrawsForLiveRoom(
      data?.draws ?? [],
      drawSource
    ).length;

    if (!hasLiveSnapshot) return;

    if (!drawsHydratedRef.current) {
      drawsHydratedRef.current = true;
      revealedDrawCountRef.current = authCount;
      setRevealedDrawCount(authCount);
      lastRevealAtRef.current = Date.now();
      return;
    }

    if (
      shouldRewindRevealCursor(
        authCount,
        revealedDrawCountRef.current,
        data?.source
      )
    ) {
      revealedDrawCountRef.current = authCount;
      setRevealedDrawCount(authCount);
    }

    if (authCount > revealedDrawCountRef.current) {
      scheduleNextDrawRevealRef.current();
    }
  }, [data?.draws, data?.source, hasLiveSnapshot]);

  useEffect(() => {
    if (replayModeRef.current) return;
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
    cardPoolMetaRef.current = data?.card_pool ?? null;
  }, [data?.room?.draw_interval_sec, data?.card_pool]);

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
      const snapshot = await fetchSnapshot(roomId, {
        scope: "draws",
        engineOnly: resolveEngineOnlyFetch(),
      });
      roomStatusRef.current = (snapshot.room.status || "").trim().toLowerCase();
      setData((prev) =>
        commitSnapshotUpdate(
          prev,
          snapshot,
          takePendingDrawsForSnapshot(prev, pendingRtDrawsRef)
        ) ?? prev
      );
      markDrawSynced();
      console.log("[LiveRoom] draw sync poll (engine snapshot)", {
        serverDraws: snapshot.draws.length,
        eventSeq: snapshot.eventSeq,
        source: snapshot.source,
      });
      if (shouldSyncWinnersDisplayFromDb(dataRef.current)) {
        void syncWinnersFromApiRef.current(dataRef.current);
      }
    } catch (err) {
      console.warn("[LiveRoom] draw sync poll error:", err);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [roomId, markDrawSynced, fetchSnapshot, commitSnapshotUpdate, resolveEngineOnlyFetch]);

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
      const cardPoolMeta = cardPoolMetaRef.current;
      if (shouldUseDrawsOnlyLiveRoomFallback(cardPoolMeta)) {
        const snapshot = await fetchSnapshot(roomId, {
          scope: "draws",
          engineOnly: resolveEngineOnlyFetch(),
        });
        const nextStatus = (snapshot.room.status || "").trim().toLowerCase();
        roomStatusRef.current = nextStatus;
        setData((prev) =>
          commitSnapshotUpdate(
            prev,
            snapshot,
            takePendingDrawsForSnapshot(prev, pendingRtDrawsRef)
          ) ?? prev
        );
        markDrawSynced();
        console.log("[LiveRoom] fallback poll (draws-only, card pool cache warm)", {
          serverDraws: snapshot.draws.length,
          eventSeq: snapshot.eventSeq,
          source: snapshot.source,
        });
        return;
      }

      const snapshot = await fetchSnapshot(roomId, {
        engineOnly: resolveEngineOnlyFetch(),
      });
      const nextStatus = (snapshot.room.status || "").trim().toLowerCase();
      roomStatusRef.current = nextStatus;
      setData((prev) =>
        commitSnapshotUpdate(
          prev,
          snapshot,
          takePendingDrawsForSnapshot(prev, pendingRtDrawsRef)
        ) ?? prev
      );
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
    fetchSnapshot,
    commitSnapshotUpdate,
    resolveEngineOnlyFetch,
  ]);

  const runFallbackPollRef = useRef(runFallbackPoll);
  useEffect(() => {
    runFallbackPollRef.current = runFallbackPoll;
  }, [runFallbackPoll]);

  const markRealtimeActivityRef = useRef(markRealtimeActivity);
  useEffect(() => {
    markRealtimeActivityRef.current = markRealtimeActivity;
  }, [markRealtimeActivity]);

  const applyResultsRealtimeRow = useCallback((newRow: any) => {
    if (!newRow) return;
    markRealtimeActivityRef.current();

    if (newRow.win_type === "line") {
      const rawDraw = newRow.draw_number ?? newRow.draw;
      const entry: LineWinner = {
        ticketId: newRow.ticket_id,
        userId: newRow.user_id,
        drawNumber:
          rawDraw === null || rawDraw === undefined ? 0 : Number(rawDraw),
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
          rawDraw === null || rawDraw === undefined ? 0 : Number(rawDraw),
      };

      setFullWinners((prev) => {
        if (prev.some((w) => w.ticketId === fullEntry.ticketId)) return prev;
        const next = [...prev, fullEntry];
        console.log("[LiveRoom] fullWinners updated →", next);
        return next;
      });

      console.log("[LiveRoom] full win detected");
    }
  }, []);

  // state پاپ‌آپ و sync اعداد با عوض شدن room ریست شود
  useEffect(() => {
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
    if (resultsDelayTimerRef.current) {
      clearTimeout(resultsDelayTimerRef.current);
      resultsDelayTimerRef.current = null;
    }
    resultsDelayResolveRef.current?.();
    resultsDelayResolveRef.current = null;
    resultsOpenGenerationRef.current += 1;
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
    replayModeRef.current = false;
    lastEventSeqRef.current = null;
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
      if (resultsDelayTimerRef.current) {
        clearTimeout(resultsDelayTimerRef.current);
        resultsDelayTimerRef.current = null;
      }
      resultsDelayResolveRef.current?.();
      resultsDelayResolveRef.current = null;
      resultsOpenGenerationRef.current += 1;
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

  // اسکرول تمام‌صفحه: هدر و بقیه صفحه با هم حرکت کنند، نه فقط کارت‌ها
  useEffect(() => {
    setFullPageScroll(true);
    return () => setFullPageScroll(false);
  }, [setFullPageScroll]);

  useEffect(() => {
    onResolvedTournamentId?.(data?.tournament?.id ?? null);
  }, [data?.tournament?.id, onResolvedTournamentId]);

  // غیرفعال کردن refresh دستی ding/toman در هدر حین بازی فعال
  useEffect(() => {
    if (isGuestSpectate) return;
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

    async function loadInitialSnapshot() {
      if (!roomId || isHardExiting()) return;
      try {
        console.info("[LiveRoom] Fetching live-room snapshot", { roomId });
        const snapshot = await fetchSnapshot(roomId, {
          engineOnly: resolveEngineOnlyFetch(),
        });
        if (!isMounted) return;

        roomStatusRef.current = (snapshot.room.status || "")
          .trim()
          .toLowerCase();
        replayModeRef.current = isRoomTerminalStatus(roomStatusRef.current);
        if (replayModeRef.current) {
          console.log("[LiveRoom] Replay mode; results dialog suppressed", {
            roomId,
            status: roomStatusRef.current,
          });
        }
        setData((prev) => commitSnapshotUpdate(prev, snapshot) ?? snapshot);
        setHasLiveSnapshot(true);
        persistLiveRoomShellCache(roomId, snapshot);
        markDrawSynced();
        setError(null);

        console.info("[LiveRoom] Hydrated from snapshot", {
          roomId,
          draws: snapshot.draws.map((d) => d.number),
        });

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
      }
    }

    loadInitialSnapshot();

    return () => {
      isMounted = false;
    };
  }, [roomId, fetchSnapshot, commitSnapshotUpdate, resolveEngineOnlyFetch]);

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

  // ریل‌تایم PG: فقط per_draw — manifest_ram از engine_ram snapshot poll می‌خواند.
  useEffect(() => {
    if (isGuestSpectate) return;
    if (!roomId || !session.authReady || !hasLiveSnapshot) return;
    if (!shouldUsePgLiveDrawUpdates(dataRef.current)) {
      return;
    }

    console.log("[LiveRoom] realtime useEffect mount for room", roomId);

    let cancelled = false;
    let hadSubscribed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const applyProcessedDraw = (payload: {
      old?: Record<string, unknown>;
      new: Record<string, unknown>;
    }) => {
      if (!shouldUsePgLiveDrawUpdates(dataRef.current)) return;

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
            applyResultsRealtimeRow(payload.new as any);
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
  }, [
    roomId,
    session.authReady,
    session.tokenVersion,
    session.accessToken,
    hasLiveSnapshot,
    data?.source,
    data?.room?.gameplay_persist_mode,
  ]);

  // manifest_ram: فقط results realtime — draw truth از engine_ram poll می‌آید.
  useEffect(() => {
    if (isGuestSpectate) return;
    if (!roomId || !session.authReady || !hasLiveSnapshot) return;
    if (shouldUsePgLiveDrawUpdates(dataRef.current)) return;

    console.log("[LiveRoom] manifest_ram results realtime mount", { roomId });

    let cancelled = false;
    let hadSubscribed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribeResultsRealtime = async () => {
      if (cancelled) return;

      const {
        data: { session: authSession },
      } = await supabase.auth.getSession();
      if (!authSession?.access_token) {
        console.warn("[LiveRoom] no auth session for results realtime");
        return;
      }
      if (cancelled) return;

      channel = supabase
        .channel(`live-room-results:${roomId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "results",
            filter: `room_id=eq.${roomId}`,
          },
          (payload) => {
            console.log("[LiveRoom] manifest_ram results payload", payload);
            applyResultsRealtimeRow(payload.new as any);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "rooms",
            filter: `id=eq.${roomId}`,
          },
          (payload) => {
            const newStatus = (payload.new as any)?.status as string | undefined;
            if (!newStatus) return;
            markRealtimeActivityRef.current();
            roomStatusRef.current = newStatus.trim().toLowerCase();
            setData((prev) =>
              prev
                ? { ...prev, room: { ...prev.room, status: newStatus } }
                : prev
            );
          }
        );

      channel.subscribe((status) => {
        if (cancelled) return;
        console.log("[LiveRoom] manifest_ram results channel:", status);
        if (status === "SUBSCRIBED") {
          void syncWinnersFromApiRef.current(dataRef.current);
          if (hadSubscribed) {
            void runFallbackPollRef.current();
          }
          hadSubscribed = true;
        } else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          void syncWinnersFromApiRef.current(dataRef.current);
        }
      });
    };

    void subscribeResultsRealtime();

    return () => {
      cancelled = true;
      console.log("[LiveRoom] cleanup manifest_ram results realtime", roomId);
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
  }, [
    roomId,
    session.authReady,
    session.tokenVersion,
    session.accessToken,
    hasLiveSnapshot,
    data?.source,
    data?.room?.gameplay_persist_mode,
    applyResultsRealtimeRow,
  ]);

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
    void refreshAllBalances?.({ force: true });
    invalidateActiveGames?.();
  }, [
    data?.room.status,
    roomId,
    scheduleWalletBalanceSync,
    refreshAllBalances,
    invalidateActiveGames,
  ]);

  // ---- رندر ----

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
  const roomCode = data.room.room_code || `اتاق ${data.room.card_price}`;
  const displayRoomName = data.room.room_name?.trim() || null;
  const roomCommitHash = (data.room as any)?.room_seed_hash ?? null;
  const orderedCards = [...data.cards].sort(
    (a, b) => Number(b.is_my_card) - Number(a.is_my_card)
  );

  const hasRevealedLineWinner =
    !data.tournament?.id && displayLineWinners.length > 0;

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
      <div className="mx-auto flex w-full max-w-3xl flex-col">
        <div className="px-4 pt-2 pb-1">
          <div
            className={`${styles.gameStatusPanel} bg-cover bg-center bg-no-repeat`}
            style={{
              backgroundImage: `linear-gradient(rgba(0,0,0,0.28), rgba(0,0,0,0.28)), url(${gameHeaderBg.src})`,
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
              roomName={roomCode}
              displayRoomName={displayRoomName}
              showRoomBadge={false}
              commitHash={roomCommitHash}
              currentNumber={latestNumber ?? null}
              history={previousNumbers}
              totalDraws={displayedCalledNumbers.length}
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

        <div className="space-y-2 px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
          {orderedCards.map((card) => (
            <div
              key={card.ticket_id}
              className="bg-transparent rounded-3xl"
              onPointerDown={
                overlayVariant
                  ? (event) => {
                      cardPointerStartYRef.current = event.clientY;
                    }
                  : undefined
              }
              onPointerUp={
                overlayVariant
                  ? (event) => {
                      const startY = cardPointerStartYRef.current;
                      cardPointerStartYRef.current = null;
                      if (startY == null) return;
                      if (Math.abs(event.clientY - startY) >= CARD_INFO_TOGGLE_MOVE_PX) {
                        return;
                      }
                      setCardsInfoVisible((visible) => !visible);
                    }
                  : undefined
              }
              onPointerCancel={
                overlayVariant
                  ? () => {
                      cardPointerStartYRef.current = null;
                    }
                  : undefined
              }
            >
              <BingoCardDemo
                ticketId={card.ticket_id}
                calledNumbers={displayedCalledNumbers}
                playerName={card.is_my_card ? "کارت های من" : card.player_name}
                cardNumber={card.card_number ?? undefined}
                size="large"
                isMyCard={card.is_my_card}
                linePrize={true}
                lineWinners={displayLineWinners}
                fullWinners={fullWinners}
                cardData={card.card}
                infoPresentation={overlayVariant ? "row1-overlay" : "header"}
                infoOverlayVisible={overlayVariant && cardsInfoVisible}
              />
            </div>
          ))}
        </div>
      </div>

      <GameResultsDialog
        isOpen={showResultsDialog}
        onClose={() => {
          setShowResultsDialog(false);
          if (guestSpectate?.backPath) {
            router.push(guestSpectate.backPath);
            return;
          }
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
            <span dir="ltr" className="numeric-text numeric-text--16">
              {roomCode}
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
        cardPrice={results?.cardPrice ?? cardPrice}
        showPlayerDingStats={!isGuestSpectate}
        dingSettled={results?.dingSettled ?? false}
        playerDingAmount={results?.playerDingAmount ?? 0}
        dingBalanceAfterSettlement={results?.dingBalanceAfterSettlement ?? 0}
      />
    </div>
  );
}
