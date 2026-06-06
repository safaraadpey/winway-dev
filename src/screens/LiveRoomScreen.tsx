"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchLiveRoomSnapshot,
  type LiveRoomSnapshot,
  fetchRoomResults,
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

type LineWinner = {
  ticketId: string;
  userId: string;
  drawNumber: number;
};

interface LiveRoomScreenProps {
  roomId: string;
}

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
  const { setShowStatusBar } = useHeaderVisibility();
  const { scheduleDingBalanceSync } = useBalancesContext();

  const [data, setData] = useState<LiveRoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [lineWinners, setLineWinners] = useState<LineWinner[]>([]);

  const [results, setResults] = useState<RoomResultsResponse | null>(null);
  const [resultsRequested, setResultsRequested] = useState(false);
  const [showResultsDialog, setShowResultsDialog] = useState(false);
  const resultsRequestedRef = useRef(false);
  const openingResultsRef = useRef(false);

  useEffect(() => {
    resultsRequestedRef.current = resultsRequested;
  }, [resultsRequested]);

  // state پاپ‌آپ فقط با عوض شدن room ریست شود (نه وقتی status هنوز playing است)
  useEffect(() => {
    setResultsRequested(false);
    setShowResultsDialog(false);
    setResults(null);
    resultsRequestedRef.current = false;
    openingResultsRef.current = false;
  }, [roomId]);

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
      const res = await fetchRoomResults(roomId);
      setResults(res);
      setShowResultsDialog(true);
      markSeenGameResults(key);
    } catch (err) {
      console.error("[LiveRoom] winners fetch error:", err);
      setShowResultsDialog(true);
      markSeenGameResults(key);
    } finally {
      openingResultsRef.current = false;
    }
  }, [roomId]);

  const syncLineWinnersFromApi = useCallback(
    async (snapshot: LiveRoomSnapshot) => {
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

  // Countdown تا اولین draw (نمایش در جای عدد current در DrawStrip وقتی هنوز عددی نداریم)
  const [firstDrawCountdownSec, setFirstDrawCountdownSec] = useState<number | null>(null);
  const serverOffsetRef = useRef<number>(0);

  // برای استفاده داخل callback های realtime (جلوگیری از stale closure)
  const dataRef = useRef<LiveRoomSnapshot | null>(null);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const prevCalledNumbersRef = useRef<number[]>([]);

  const detectMarkOnMyCards = useCallback(
    (number: number, snapshot: LiveRoomSnapshot | null | undefined): boolean => {
      if (!snapshot?.cards?.length) return false;
      return snapshot.cards.some((c) => {
        if (!c.is_my_card) return false;
        return c.card?.some((row) => row.some((v) => v === number)) ?? false;
      });
    },
    []
  );

  const scheduleDingSyncForNumber = useCallback(
    (number: number, snapshot: LiveRoomSnapshot | null | undefined) => {
      if (!roomId || number == null) return;
      if (!detectMarkOnMyCards(number, snapshot)) return;
      scheduleDingBalanceSync?.(`${roomId}:${number}`, true);
    },
    [roomId, detectMarkOnMyCards, scheduleDingBalanceSync]
  );

  // Polling + realtime هر دو calledNumbers را آپدیت می‌کنند؛
  // بعد از جدا شدن game-engine، processed_at ممکن است دیر یا اصلاً از realtime نرسد.
  useEffect(() => {
    if (!data) return;

    const prev = prevCalledNumbersRef.current;
    const newNumbers = calledNumbers.filter((n) => !prev.includes(n));
    prevCalledNumbersRef.current = calledNumbers;

    for (const number of newNumbers) {
      scheduleDingSyncForNumber(number, data);
    }
  }, [calledNumbers, data, scheduleDingSyncForNumber]);

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
        setCalledNumbers(snapshot.draws.map((d) => d.number));
        setError(null);

        console.log(
          "[LiveRoom] snapshot loaded, draws:",
          snapshot.draws.map((d) => d.number)
        );

        if (isMounted) await syncLineWinnersFromApi(snapshot);
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
  }, [roomId, syncLineWinnersFromApi]);

  // Polling سبک: فقط sync UI از API (بدون دست‌کاری status / draw_jobs در DB)
  const roomStatusRef = useRef<string>("");
  useEffect(() => {
    roomStatusRef.current = (data?.room?.status || "").trim().toLowerCase();
  }, [data?.room?.status]);

  useEffect(() => {
    if (!roomId) return;

    let cancelled = false;
    const ACTIVE = new Set(["waiting", "running", "playing", "live", "settling"]);

    const poll = async () => {
      if (cancelled) return;

      const status = roomStatusRef.current;
      if (status && !ACTIVE.has(status)) return;

      try {
        const snapshot = await fetchLiveRoomSnapshot(roomId);
        if (cancelled) return;

        const status = (snapshot.room.status || "").trim().toLowerCase();
        roomStatusRef.current = status;
        setData(snapshot);
        setCalledNumbers((prev) => {
          const next = snapshot.draws.map((d) => d.number);
          for (const n of next) {
            if (!prev.includes(n)) void playNumber(n);
          }
          return next;
        });

        const isTerminal = ["settling", "finished", "cancelled"].includes(status);
        await syncLineWinnersFromApi(snapshot);
        if (isTerminal) void tryOpenResultsDialog();
      } catch (err) {
        console.warn("[LiveRoom] poll error:", err);
      }
    };

    const interval = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, tryOpenResultsDialog, syncLineWinnersFromApi]);

  // برنده full ثبت شده ولی status هنوز playing (تسویه عقب افتاده)
  useEffect(() => {
    if (!roomId || !data) return;

    const status = (data.room.status || "").trim().toLowerCase();
    const stillPlaying = ["running", "playing", "live", "waiting"].includes(status);
    if (!stillPlaying) return;

    let cancelled = false;

    const checkResults = async () => {
      if (cancelled || resultsRequestedRef.current) return;
      try {
        const res = await fetchRoomResults(roomId);
        if (cancelled || !res.fullWinners?.length) return;
        await tryOpenResultsDialog();
      } catch (err) {
        console.warn("[LiveRoom] endgame results check failed:", err);
      }
    };

    const interval = setInterval(checkResults, 4000);
    void checkResults();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [roomId, data, data?.room?.status, tryOpenResultsDialog]);

  // ریل‌تایم: draws + rooms + results
  useEffect(() => {
    if (!roomId) return;

    console.log("[LiveRoom] realtime useEffect mount for room", roomId);

    const channel = supabase
      .channel(`live-room-${roomId}`)
      // برای دیباگ: هر event روی draws
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "draws",
        },
        (payload) => {
          console.log("🔥 [LiveRoom] ANY draw event:", payload);
        }
      )
      // اعداد جدید (UPDATE با processed_at)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "draws",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const oldProcessed = (payload.old as any)?.processed_at ?? null;
          const newProcessed = (payload.new as any)?.processed_at ?? null;
          const number = (payload.new as any)?.number as number | undefined;
          const drawId = (payload.new as any)?.id as string | undefined;

          console.log("[LiveRoom] RT draw payload", {
            number,
            oldProcessed,
            newProcessed,
            drawId,
          });

          // فقط وقتی از null → مقدار ست شده
          if (oldProcessed !== null && oldProcessed !== undefined) return;
          if (!newProcessed) return;
          if (number == null) return;

          // Play number audio with minimal latency (client-only, Web Audio API)
          void playNumber(number);

          // اگر processed_at از realtime رسید، sync را اینجا هم تریگر کن (کلید یکسان با polling)
          try {
            scheduleDingSyncForNumber(number, dataRef.current);
          } catch (e) {
            console.warn("[LiveRoom] ding sync scheduling failed:", e);
          }

          setCalledNumbers((prev) => {
            if (prev.includes(number)) return prev;
            const next = [...prev, number];
            console.log("[LiveRoom] calledNumbers updated →", next);
            return next;
          });

          // draws را در data نیز آپدیت کن (برای سازگاری با سایر کامپوننت‌ها)
          setData((prev) => {
            if (!prev) return prev;
            if (prev.draws.some((d) => d.number === number)) return prev;

            const createdAt =
              (payload.new as any)?.created_at ||
              (payload.new as any)?.timestamp ||
              new Date().toISOString();

            return {
              ...prev,
              draws: [...prev.draws, { number, created_at: createdAt }],
            };
          });
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

          if (newRow.win_type === "line") {
            const entry: LineWinner = {
              ticketId: newRow.ticket_id,
              userId: newRow.user_id,
              drawNumber: newRow.draw_number ?? newRow.draw ?? 0,
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
  }, [roomId, tryOpenResultsDialog, scheduleDingSyncForNumber]);

  // userId فعلی
  const currentUserId = useMemo(() => {
    if (!data) return null;
    const mine = data.cards.find((c) => c.is_my_card && c.player_id);
    return mine?.player_id ?? null;
  }, [data]);

  // status از realtime/poll به settling|finished رسید
  useEffect(() => {
    const status = (data?.room.status || "").trim().toLowerCase();
    const isFinished =
      status !== "" &&
      !["running", "playing", "live", "waiting"].includes(status);

    if (!isFinished) return;

    console.log("[LiveRoom] room finished with status:", status);
    void tryOpenResultsDialog();
  }, [data?.room.status, tryOpenResultsDialog]);

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
              hasLineWinner={!data.tournament?.id && lineWinners.length > 0}
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
