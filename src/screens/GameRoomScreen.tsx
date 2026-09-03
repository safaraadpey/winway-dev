"use client";

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/contexts/SessionContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import useScreenWakeLock from "@/lib/hooks/useScreenWakeLock";
import BuyCardsPanel from "@/components/room/BuyCardsPanel";
import ActiveCardsStatus, {
  ActiveCardStatus,
} from "@/components/room/ActiveCardsStatus";
import ActiveTablesSection from "@/components/room/ActiveTablesSection";
import { ActiveTable } from "@/components/ActiveTablesPanel";
import { supabase } from "@/lib/supabaseClient";
import {
  joinOrCreateRoom,
  type RoomInfo,
  fetchGameRoomView,
  type GameRoomView,
  cancelWaitingRoom,
} from "@/services/rooms";
import toast from "react-hot-toast";
import {
  playLiveRoomMusic,
  stopLiveRoomMusic,
} from "@/lib/audio/music";
import { isMusicEnabled as readMusicEnabled, setMusicEnabled } from "@/lib/audio-settings";
import { isHardExiting } from "@/lib/auth/hardExit";
import { useAutoStartTour } from "@/lib/hooks/useAutoStartTour";
import { GAME_ROOM_TOUR_ID } from "@/lib/tour/configs/gameRoomTour";
import {
  fetchAutoBuySnapshot,
  startAutoBuy,
  stopAutoBuy,
} from "@/lib/autoBuy/client";
import type { AutoBuySnapshot } from "@/lib/autoBuy/types";
import {
  buildGameRoomShell,
  gameRoomSessionKey,
  mergeShellForRoomIdTransition,
  persistGameRoomShellFromSnapshot,
} from "@/lib/gameroom/gameRoomShell";
import styles from "./GameRoomScreen.module.css";

interface GameRoomScreenProps {
  roomId?: string;
  templateId?: string;
  priceHint?: number;
  roomNameHint?: string;
  /** Explicit watch of a live table (active-table click). Do not bounce to buy page. */
  spectate?: boolean;
  onEnterLive?: (roomId: string) => void;
}

const LIVE_ENTER_STATUSES = new Set([
  "playing",
  "running",
  "live",
  "settling",
  "settled",
  "finished",
]);

function shouldEnterLiveRoom(
  mode: GameRoomView["mode"],
  status: string | null | undefined
): boolean {
  if (mode === "running") return true;
  const normalized = (status || "").trim().toLowerCase();
  return LIVE_ENTER_STATUSES.has(normalized);
}

function isWaitingViewElapsed(view: GameRoomView): boolean {
  if (view.mode !== "waiting") return false;
  if (!view.room.starts_at) return false;
  const startsMs = Date.parse(view.room.starts_at);
  const nowMs = Date.parse(view.server_now);
  if (Number.isFinite(startsMs) && Number.isFinite(nowMs)) {
    return startsMs <= nowMs;
  }
  return (view.countdown_seconds ?? 0) <= 0;
}

function spectatorShouldLeaveRoom(
  userHasCards: boolean,
  view: GameRoomView,
  hadTimer: boolean,
  waitingSpectator: boolean
): boolean {
  if (userHasCards) return false;
  if (shouldEnterLiveRoom(view.mode, view.room.status)) {
    return waitingSpectator;
  }
  if (isWaitingViewElapsed(view)) return true;
  if (view.mode === "waiting" && (view.countdown_seconds ?? 0) <= 0 && hadTimer) {
    return true;
  }
  return false;
}

function playerHasReservedCards(
  userId: string | null | undefined,
  cards: Array<{
    id?: string;
    user_id?: string;
    count?: number;
    card_count?: number;
  }>
): boolean {
  if (!userId) return false;
  return cards.some((card) => {
    const owner = card.id || card.user_id;
    const count = card.count ?? card.card_count ?? 0;
    return owner === userId && count > 0;
  });
}

const RECOVERY_SNAPSHOT_DEBOUNCE_MS = 800;

function syncCountdownFromView(
  view: GameRoomView,
  serverNow: number,
  setCountdownDeadline: (value: number | null) => void,
  setCountdownSeconds: (value: number) => void
): void {
  const startsAtMs = view.room.starts_at
    ? Date.parse(view.room.starts_at)
    : NaN;
  const hasValidStartsAt = Number.isFinite(startsAtMs);
  const countdownSec = view.countdown_seconds ?? 0;

  if (view.mode === "waiting") {
    if (hasValidStartsAt && startsAtMs > serverNow) {
      setCountdownDeadline(startsAtMs);
      return;
    }

    if (countdownSec > 0) {
      setCountdownDeadline(serverNow + countdownSec * 1000);
      return;
    }

    if (hasValidStartsAt) {
      setCountdownDeadline(startsAtMs);
      return;
    }

    setCountdownDeadline(null);
    setCountdownSeconds(0);
    return;
  }

  if (hasValidStartsAt) {
    setCountdownDeadline(startsAtMs);
  } else if (countdownSec > 0) {
    setCountdownDeadline(serverNow + countdownSec * 1000);
  } else {
    setCountdownDeadline(null);
    setCountdownSeconds(0);
  }
}

function applyTicketEventToActiveCards(
  prev: ActiveCardStatus[],
  payload: { eventType?: string; new?: Record<string, unknown>; old?: Record<string, unknown> }
): ActiveCardStatus[] {
  const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
  const newRow = payload.new as Record<string, unknown> | undefined;
  const oldRow = payload.old as Record<string, unknown> | undefined;

  const playerId =
    (newRow?.player_user_id as string | undefined) ??
    (oldRow?.player_user_id as string | undefined) ??
    null;

  if (!playerId) return prev;

  const activeStatuses = ["reserved", "confirmed", "consumed"];
  const isActiveStatus = (status: unknown) =>
    typeof status === "string" && activeStatuses.includes(status);

  let delta = 0;

  if (eventType === "INSERT") {
    if (newRow && isActiveStatus(newRow.reservation_status)) {
      delta = 1;
    }
  } else if (eventType === "UPDATE") {
    if (newRow && isActiveStatus(newRow.reservation_status)) {
      delta = 0;
    } else if (newRow && !isActiveStatus(newRow.reservation_status)) {
      const existing = prev.find((c) => c.id === playerId);
      if (existing && existing.count > 0) {
        delta = -1;
      }
    }
  }

  if (delta === 0) return prev;

  const current = [...prev];
  const idx = current.findIndex((c) => c.id === playerId);
  const prevCount = idx === -1 ? 0 : current[idx].count;
  const nextCount = prevCount + delta;

  if (nextCount <= 0) {
    if (idx !== -1) current.splice(idx, 1);
    return current.sort((a, b) => a.title.localeCompare(b.title, "fa"));
  }

  const title =
    (typeof newRow?.display_name === "string" ? newRow.display_name : null) ||
    (idx !== -1 ? current[idx].title : "Player");

  const item: ActiveCardStatus = {
    id: playerId,
    title,
    count: nextCount,
  };

  if (idx === -1) {
    current.push(item);
  } else {
    current[idx] = item;
  }

  return current.sort((a, b) => a.title.localeCompare(b.title, "fa"));
}

/**
 * صفحه اصلی Game Room
 * شامل تمام کامپوننت‌های مربوط به انتخاب کارت و مشاهده میزهای فعال
 */
export default function GameRoomScreen({
  roomId,
  templateId,
  priceHint,
  roomNameHint,
  spectate = false,
  onEnterLive,
}: GameRoomScreenProps) {
  const router = useRouter();
  const { userId: sessionUserId } = useSession();
  const { refreshWalletBalances } = useBalancesContext();
  const { invalidate: invalidateActiveGames, upsertOptimistic: upsertOptimisticActiveRoom } =
    useActiveGamesContext();
  useScreenWakeLock(Boolean(roomId));

  // State برای اطلاعات روم — shell فوری، hydrate از snapshot در پس‌زمینه
  const [roomInfo, setRoomInfo] = useState<RoomInfo>(() =>
    buildGameRoomShell({ roomId, templateId, priceHint, roomNameHint }).roomInfo
  );
  const [hasLiveSnapshot, setHasLiveSnapshot] = useState(false);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const sessionKeyRef = useRef(gameRoomSessionKey({ roomId, templateId }));
  const [gameMode, setGameMode] = useState<GameRoomView["mode"]>("preview");
  const enteredLiveRef = useRef(false);
  const releasedTemplateIdRef = useRef<string | null>(null);
  const spectatorLeftRef = useRef(false);
  const waitingSpectatorRef = useRef(false);
  const liveSpectateRef = useRef(false);
  const [waitingSpectator, setWaitingSpectator] = useState(false);
  const hadPositiveCountdownRef = useRef(false);
  const countdownDeadlineRef = useRef<number | null>(null);
  const autoBuyLastRoomRef = useRef<string | null>(null);
  const roomInfoRef = useRef<RoomInfo>(roomInfo);
  const fetchRoomDataRef = useRef<(reason: "initial" | "recovery") => Promise<void>>(
    async () => {}
  );
  const hasLiveSnapshotRef = useRef(false);
  const recoveryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownZeroRecoveryRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const hasCardsRef = useRef(false);
  const [globalRegistrationLocked, setGlobalRegistrationLocked] = useState(false);
  const [globalRegistrationLockReason, setGlobalRegistrationLockReason] = useState<string | null>(null);

  // State برای شمارش معکوس
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [countdownDeadline, setCountdownDeadline] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState<number>(0);

  // State برای کارت‌های فعال
  const [activeCards, setActiveCards] = useState<ActiveCardStatus[]>([]);
  const [activeCardsLoading, setActiveCardsLoading] = useState(true);

  // State برای میزهای فعال
  const [activeTables, setActiveTables] = useState<ActiveTable[]>([]);
  const [activeTablesLoading, setActiveTablesLoading] = useState(true);

  const resetPanelLoadingState = useCallback(() => {
    setActiveCards([]);
    setActiveTables([]);
    setActiveCardsLoading(true);
    setActiveTablesLoading(true);
  }, []);

  // State برای شناسه کاربر فعلی
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const resolvedUserId = sessionUserId || currentUserId;
  const cardsToRenderForCancel = activeCards;
  const hasReservedCardsForCurrentUser = playerHasReservedCards(
    resolvedUserId,
    cardsToRenderForCancel
  );
  userIdRef.current = resolvedUserId;
  hasCardsRef.current = hasReservedCardsForCurrentUser;
  countdownDeadlineRef.current = countdownDeadline;
  if (countdownSeconds > 0) {
    hadPositiveCountdownRef.current = true;
  }

  const [autoBuySnapshot, setAutoBuySnapshot] = useState<AutoBuySnapshot>({
    active: false,
  });

// Music toggle for real rooms (roomId mode only)
const [isMusicEnabled, setIsMusicEnabled] = useState(() => {
  if (roomId && !templateId) {
    return readMusicEnabled();
  }
  return false;
});

  const handleToggleMusic = () => {
    setIsMusicEnabled((prev) => {
      if (!roomId || templateId) return false;
      const next = !prev;
      setMusicEnabled(next);
      return next;
    });
  };

  const enterLive = () => {
    if (!roomId || enteredLiveRef.current) return;
    enteredLiveRef.current = true;
    console.log("[Room] Enter live", { roomId });
    onEnterLive?.(roomId);
  };

  const bounceSpectatorToTemplate = (nextTemplateId?: string | null) => {
    spectatorLeftRef.current = true;
    setActiveCards([]);
    setCountdownDeadline(null);
    setCountdownSeconds(0);

    const tid = (
      nextTemplateId ||
      roomInfoRef.current?.templateId ||
      templateId ||
      ""
    ).trim();
    if (!tid) {
      console.warn("[Room] Spectator release missing templateId", { roomId });
      return;
    }
    if (releasedTemplateIdRef.current === tid) return;
    releasedTemplateIdRef.current = tid;
    enteredLiveRef.current = true;

    setGameMode("preview");
    setRoomInfo((prev) =>
      prev
        ? {
            ...prev,
            id: tid,
            roomCode: "",
            status: "waiting",
            startsAt: undefined,
            endsAt: undefined,
            currentPlayers: 0,
            canCancel: false,
            templateId: tid,
          }
        : prev
    );

    const nextUrl = `/player/gameroom?templateId=${encodeURIComponent(tid)}`;
    console.log("[Room] Spectator stay on template", { roomId, templateId: tid });
    window.location.replace(nextUrl);
  };

  const tryEnterLive = (opts?: {
    userHasCards?: boolean;
    templateId?: string | null;
  }) => {
    if (!roomId || enteredLiveRef.current) return;
    if (!userIdRef.current) {
      console.log("[Room] Defer live enter until user id is ready", { roomId });
      return;
    }

    const userHasCards = opts?.userHasCards ?? hasCardsRef.current;
    if (userHasCards || spectate || liveSpectateRef.current) {
      if (!userHasCards) {
        console.log("[Room] Enter live as spectator", { roomId, spectate });
      }
      enterLive();
      return;
    }

    console.log("[Room] Skip live enter; waiting spectator has no cards", { roomId });
    bounceSpectatorToTemplate(opts?.templateId);
  };

  useEffect(() => {
    enteredLiveRef.current = false;
    releasedTemplateIdRef.current = null;
    spectatorLeftRef.current = false;
    waitingSpectatorRef.current = false;
    liveSpectateRef.current = false;
    setWaitingSpectator(false);
    hadPositiveCountdownRef.current = false;
    autoBuyLastRoomRef.current = null;
  }, [roomId]);

  useEffect(() => {
    roomInfoRef.current = roomInfo;
  }, [roomInfo]);

  useLayoutEffect(() => {
    const nextSessionKey = gameRoomSessionKey({ roomId, templateId });
    const prevSessionKey = sessionKeyRef.current;
    const isTemplateToRoomTransition =
      prevSessionKey.startsWith("tpl:") &&
      nextSessionKey.startsWith("room:") &&
      Boolean(roomInfoRef.current.templateId);

    if (isTemplateToRoomTransition && roomId) {
      console.info("[Room] Preserved UI on templateId→roomId transition", {
        roomId,
        templateId: roomInfoRef.current.templateId,
      });
      setRoomInfo(
        mergeShellForRoomIdTransition(
          roomInfoRef.current,
          roomId,
          roomInfoRef.current.templateId
        )
      );
      resetPanelLoadingState();
      sessionKeyRef.current = nextSessionKey;
      return;
    }

    if (prevSessionKey !== nextSessionKey) {
      const { roomInfo: shell } = buildGameRoomShell({
        roomId,
        templateId,
        priceHint,
        roomNameHint,
      });
      setRoomInfo(shell);
      setHasLiveSnapshot(false);
      hasLiveSnapshotRef.current = false;
      setSnapshotError(null);
      resetPanelLoadingState();
      sessionKeyRef.current = nextSessionKey;
    }
  }, [roomId, templateId, priceHint, roomNameHint, resetPanelLoadingState]);

  const scheduleRecoverySnapshot = useCallback((reason: string) => {
    if (recoveryDebounceRef.current) {
      clearTimeout(recoveryDebounceRef.current);
    }
    recoveryDebounceRef.current = setTimeout(() => {
      recoveryDebounceRef.current = null;
      console.info("[Room] Recovery snapshot", { reason });
      void fetchRoomDataRef.current("recovery");
    }, RECOVERY_SNAPSHOT_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (recoveryDebounceRef.current) {
        clearTimeout(recoveryDebounceRef.current);
        recoveryDebounceRef.current = null;
      }
    };
  }, []);

  // بارگذاری اطلاعات روم یا تمپلیت — initial + recovery فقط (بدون poll دوره‌ای)
  useEffect(() => {
    async function fetchRoomData(reason: "initial" | "recovery") {
      if (isHardExiting()) return;
      let nextError: string | null = null;
      try {
        if (reason === "initial") {
          console.info("[Room] Fetching gameroom snapshot", { roomId, templateId });
        }

        if (!roomId && !templateId && !releasedTemplateIdRef.current) {
          console.warn("[GAME_ROOM][INVALID_STATE]: No roomId and no templateId");
          toast.error("ورود به اتاق نامعتبر است");
          return;
        }

        const releasedTid = releasedTemplateIdRef.current;
        const view: GameRoomView = await fetchGameRoomView(
          releasedTid ? { templateId: releasedTid } : { roomId, templateId }
        );

        if (
          !releasedTid &&
          roomId &&
          view.room.id &&
          view.room.id !== roomId
        ) {
          console.warn("[GAME_ROOM][ROOM_ID_MISMATCH]", {
            requestedRoomId: roomId,
            returnedRoomId: view.room.id,
            mode: view.mode,
          });
          return;
        }

        if (!roomId && templateId && view.mode !== "preview" && view.room.id) {
          if (playerHasReservedCards(userIdRef.current, view.active_cards)) {
            router.replace(`/player/gameroom?roomId=${view.room.id}`);
            return;
          }
        }

        let mappedRoom: RoomInfo | null = null;
        setGlobalRegistrationLocked(Boolean(view.global_registration_locked));
        setGlobalRegistrationLockReason(
          view.global_registration_lock_reason?.trim() || null
        );

        const snapshotHasUserCards = playerHasReservedCards(
          userIdRef.current,
          view.active_cards
        );
        if (
          roomId &&
          userIdRef.current &&
          !snapshotHasUserCards &&
          !spectate
        ) {
          if (shouldEnterLiveRoom(view.mode, view.room.status)) {
            liveSpectateRef.current = true;
          } else if (view.mode === "waiting") {
            waitingSpectatorRef.current = true;
            setWaitingSpectator(true);
          }
        }
        const leaveAsSpectator = spectatorShouldLeaveRoom(
          snapshotHasUserCards,
          view,
          hadPositiveCountdownRef.current || countdownDeadlineRef.current != null,
          waitingSpectatorRef.current
        );
        if (
          !releasedTid &&
          roomId &&
          userIdRef.current &&
          leaveAsSpectator
        ) {
          bounceSpectatorToTemplate(view.room.template_id);
          return;
        }
        const showTemplatePreview =
          view.mode === "preview" ||
          (leaveAsSpectator && Boolean(releasedTid || !roomId));

        if (showTemplatePreview) {
          mappedRoom = {
            id: view.room.template_id,
            roomCode: "",
            roomType: view.room.room_type,
            title: view.room.title || undefined,
            status: "waiting",
            cardPrice: view.room.ticket_price,
            currency: view.room.currency || "IRR",
            countdownSec: undefined,
            startsAt: undefined,
            endsAt: undefined,
            minPlayers: view.room.min_players || undefined,
            maxPlayers: view.room.max_cards_per_player || undefined,
            currentPlayers: 0,
            templateId: view.room.template_id,
            canCancel: false,
            requiresPassword: view.room.requires_password,
          };
        } else {
          mappedRoom = {
            id: (view.room.id as string) || "",
            roomCode: view.room.room_code || "",
            roomType: view.room.room_type,
            title: view.room.title || undefined,
            status: view.room.status || "waiting",
            cardPrice: view.room.ticket_price,
            currency: view.room.currency || "IRR",
            countdownSec: undefined,
            startsAt: view.room.starts_at || undefined,
            endsAt: view.room.ends_at || undefined,
            minPlayers: view.room.min_players || undefined,
            maxPlayers: view.room.max_cards_per_player || undefined,
            currentPlayers: view.active_cards.length,
            templateId: view.room.template_id,
            canCancel: view.can_cancel,
            requiresPassword: view.room.requires_password,
          };
        }

        if (!mappedRoom) {
          console.error("[GAME_ROOM][NO_ROOM_MAPPED]", {
            roomId,
            templateId,
            view,
          });
          toast.error("روم یافت نشد");
          nextError = "روم یافت نشد";
          return;
        }

        setRoomInfo(mappedRoom);
        setHasLiveSnapshot(true);
        hasLiveSnapshotRef.current = true;
        setSnapshotError(null);
        persistGameRoomShellFromSnapshot(mappedRoom, { roomId, templateId });
        console.info("[Room] Hydrated from snapshot", {
          roomId,
          templateId,
          mode: view.mode,
          reason,
        });
        setGameMode(showTemplatePreview ? "preview" : view.mode);
        if (!releasedTemplateIdRef.current && view.mode === "running") {
          tryEnterLive({
            userHasCards: snapshotHasUserCards,
            templateId: view.room.template_id,
          });
        }

        const tables: ActiveTable[] = view.active_tables.map((table) => ({
          id: table.room_id,
          roomCode: table.room_code,
          prize: table.prize,
          players: table.players,
          cardCount: table.card_count,
        }));
        setActiveTables(tables);
        setActiveTablesLoading(false);

        if (releasedTemplateIdRef.current && !releasedTid) {
          return;
        }

        const serverNow = new Date(view.server_now).getTime();
        const clientNow = Date.now();
        setServerOffset(serverNow - clientNow);

        if (showTemplatePreview) {
          setCountdownDeadline(null);
          setCountdownSeconds(0);
          setActiveCards([]);
          setActiveCardsLoading(false);
          return;
        }

        syncCountdownFromView(
          view,
          serverNow,
          setCountdownDeadline,
          setCountdownSeconds
        );

        const activeCardsList: ActiveCardStatus[] = view.active_cards.map(
          (card: GameRoomView["active_cards"][number]) => ({
            id: card.user_id,
            title: card.display_name,
            count: card.card_count,
          })
        );
        setActiveCards(activeCardsList);
        setActiveCardsLoading(false);
      } catch (error: unknown) {
        console.error("[Room] Error loading room data:", error);
        nextError =
          error instanceof Error
            ? error.message
            : "خطا در بارگذاری اطلاعات روم";
        toast.error(nextError);
      } finally {
        if (nextError) {
          setSnapshotError(nextError);
          if (reason === "initial") {
            setActiveTablesLoading(false);
            setActiveCardsLoading(false);
          }
        }
      }
    }

    fetchRoomDataRef.current = fetchRoomData;
    countdownZeroRecoveryRef.current = false;
    void fetchRoomData("initial");
  }, [roomId, templateId, router]);

  useEffect(() => {
    if (!resolvedUserId || roomId || !templateId) return;
    void fetchRoomDataRef.current("recovery");
  }, [resolvedUserId, roomId, templateId]);

  // Enter live when the room started, or when the user opened a live table to watch.
  // Waiting-room spectators without cards bounce back to the template instead.
  useEffect(() => {
    if (!roomId || enteredLiveRef.current) return;

    if (spectate || shouldEnterLiveRoom(gameMode, roomInfo?.status)) {
      tryEnterLive({ templateId: roomInfo?.templateId });
    }
  }, [
    roomId,
    spectate,
    gameMode,
    roomInfo?.status,
    roomInfo?.templateId,
    resolvedUserId,
    hasReservedCardsForCurrentUser,
  ]);

  useEffect(() => {
    if (!roomId || enteredLiveRef.current) return;

    const onDrawRow = (payload: { new: Record<string, unknown> }) => {
      if (releasedTemplateIdRef.current) return;
      if (!payload.new?.processed_at) return;
      setGameMode("running");
      setRoomInfo((prev) =>
        prev ? { ...prev, status: "playing" } : prev
      );
      tryEnterLive({ templateId: roomInfoRef.current?.templateId });
    };

    const channel = supabase
      .channel(`gameroom_live_probe_${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "draws",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => onDrawRow(payload as { new: Record<string, unknown> })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  // نزدیک شروع بازی: realtime rooms/draws مسیر اصلی است؛ poll دوره‌ای حذف شده
  useEffect(() => {
    // اگر already در یک روم واقعی هستیم، نیازی به این subscription نیست
    if (roomId) return;

    // اگر templateId نداریم، یعنی در حالت template نیستیم
    if (!templateId) return;

    const handler = (payload: any) => {
      const newRoom = payload.new as any;
      const newRoomId = newRoom?.id as string | undefined;

      console.log("[RT][ROOMS][TEMPLATE_INSERT]", {
        templateId,
        newRoomId,
        payload,
        at: new Date().toISOString(),
      });

      if (!newRoomId) {
        console.log("[RT][ROOMS][TEMPLATE_INSERT][NO_ID]", { payload });
        return;
      }

      // بیننده را به روم جدید هل نده؛ خریدار بعد از RPC خودش به roomId می‌رود.
      // snapshot تمپلیت را تازه کن تا صف waiting دیده شود.
      scheduleRecoverySnapshot("template-room-insert");
    };

    const channel = supabase
      .channel(`template_${templateId}_rooms`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rooms",
          filter: `room_template_id=eq.${templateId}`,
        },
        handler
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, templateId, supabase, scheduleRecoverySnapshot]);

  // Realtime: playing tables — وقتی میز هم‌قیمت به playing می‌رود
  useEffect(() => {
    const tid = roomInfo?.templateId || templateId;
    if (!tid) return;

    const handler = (payload: { new?: Record<string, unknown> }) => {
      const newRoom = payload.new;
      if (!newRoom) return;
      const nextStatus = String(newRoom.status ?? "");
      if (nextStatus !== "playing" && nextStatus !== "live") return;
      scheduleRecoverySnapshot("template-room-playing");
    };

    const channel = supabase
      .channel(`template_${tid}_rooms_playing`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `room_template_id=eq.${tid}`,
        },
        handler
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomInfo?.templateId, templateId, supabase, scheduleRecoverySnapshot]);

  // دریافت شناسه کاربر فعلی
  useEffect(() => {
    async function getCurrentUser() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.error("Error getting current user:", error);
          return;
        }
        setCurrentUserId(user?.id || null);
      } catch (error) {
        console.error("Error in getCurrentUser:", error);
      }
    }
    getCurrentUser();
  }, []);

  // در حالت roomId، وضعیت ترجیح کاربر را از تنظیم یکپارچه می‌خوانیم
  useEffect(() => {
    if (!roomId || templateId) return;

    const stored = readMusicEnabled();
    setIsMusicEnabled(stored);
  }, [roomId, templateId]);

  // موسیقی بک‌گراند: فقط وقتی roomId داریم (خرید انجام شده) و در حالت template نیستیم
  useEffect(() => {
    if (!roomId || templateId) {
      stopLiveRoomMusic();
      setIsMusicEnabled(false);
      return;
    }

    if (isMusicEnabled) {
      playLiveRoomMusic();
      return () => {
        stopLiveRoomMusic();
      };
    }

    stopLiveRoomMusic();
    return;
  }, [roomId, templateId, isMusicEnabled]);

  // شمارش معکوس محلی با استفاده از deadline و server offset
  useEffect(() => {
    if (!countdownDeadline) return;

    const id = setInterval(() => {
      const clientNow = Date.now();
      const serverNow = clientNow + serverOffset;
      const remainingMs = countdownDeadline - serverNow;
      const remaining = Math.max(0, Math.floor(remainingMs / 1000));
      setCountdownSeconds(remaining);
    }, 1000);

    return () => clearInterval(id);
  }, [countdownDeadline, serverOffset]);

  // countdown به ۰ رسید → یک recovery snapshot (بدون poll تکراری)
  const prevCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      prevCountdownRef.current != null &&
      prevCountdownRef.current > 0 &&
      countdownSeconds === 0 &&
      !countdownZeroRecoveryRef.current
    ) {
      countdownZeroRecoveryRef.current = true;
      scheduleRecoverySnapshot("countdown-zero");
    }
    prevCountdownRef.current = countdownSeconds;
  }, [countdownSeconds, scheduleRecoverySnapshot]);

  useEffect(() => {
    if (!roomId) return;

    const ticketFilter = `room_id=eq.${roomId}`;

    const handler = (payload: {
      eventType?: string;
      new?: Record<string, unknown>;
      old?: Record<string, unknown>;
    }) => {
      if (releasedTemplateIdRef.current || spectatorLeftRef.current) return;
      if (!hasLiveSnapshotRef.current) return;

      console.log("[RT][TICKETS]", {
        eventType: payload.eventType,
        roomId,
        at: new Date().toISOString(),
      });

      setActiveCards((prev) => applyTicketEventToActiveCards(prev, payload));
    };

    const channel = supabase
      .channel(`room_${roomId}_tickets`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tickets",
          filter: ticketFilter,
        },
        handler
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "tickets",
          filter: ticketFilter,
        },
        handler
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase]);

  useEffect(() => {
    if (!roomId) return;

    const handler = (payload: any) => {
      if (releasedTemplateIdRef.current) return;
      const newRoom = payload.new as any;
      const oldRoom = payload.old as any;

      console.log("[RT][ROOM]", {
        eventType: payload.eventType,
        new: newRoom,
        old: oldRoom,
        at: new Date().toISOString(),
      });

      const nextStatus = (newRoom.status ?? "") as string;
      const becameLive =
        nextStatus === "playing" ||
        nextStatus === "running" ||
        nextStatus === "live";

      setRoomInfo((prev) => {
        if (!prev) return prev;
        if (prev.id !== newRoom.id) return prev;

        if (becameLive) {
          setGameMode("running");
        } else if (nextStatus === "finished" || nextStatus === "settling") {
          setGameMode("finished");
        }

        return {
          ...prev,
          status: nextStatus || prev.status,
          startsAt: newRoom.starts_at ?? prev.startsAt,
          endsAt: newRoom.ends_at ?? prev.endsAt,
        };
      });

      if (becameLive) {
        tryEnterLive({
          templateId: newRoom.room_template_id ?? roomInfoRef.current?.templateId,
        });
      }

      // چک کردن لغو روم و redirect به template
      if (newRoom.status === "cancelled" || newRoom.status === "canceled") {
        const templateId = newRoom.room_template_id ?? roomInfo?.templateId;
        
        if (templateId) {
          console.log("[RT][ROOM][CANCEL_REDIRECT]", {
            roomId,
            templateId,
            newStatus: newRoom.status,
          });
          router.replace(`/player/gameroom?templateId=${templateId}`);
        }
      }

      // منطق countdown:
      // اگر روم هنوز waiting است و starts_at دارد → deadline را از روی starts_at تنظیم کن
      if (newRoom.status === "waiting" && newRoom.starts_at) {
        const deadline = Date.parse(newRoom.starts_at);
        if (Number.isFinite(deadline)) {
          setCountdownDeadline(deadline);
        }
        return;
      }

      // اگر روم از waiting خارج شد (running, live, finished, cancelled و ...) → countdown را ریست کن
      if (newRoom.status !== "waiting") {
        setCountdownSeconds(0);
        setCountdownDeadline(null);
      }
    };

    const channel = supabase
      .channel(`room_${roomId}_status`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${roomId}`,
        },
        handler
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase, router, roomInfo?.templateId]);

  const totalPlayersWithCards =
  cardsToRenderForCancel.filter((card) => card.count > 0).length;
  // بازیکن فقط در 8 ثانیه آخر countdown و فقط اگر کارت فعال داشته باشد اجازه لغو رزرو دارد
  const canCancel = Boolean(
    roomId &&
    countdownSeconds > 0 &&
    countdownSeconds <= 8 &&
    roomInfo?.status === "waiting" &&
    hasReservedCardsForCurrentUser &&
    totalPlayersWithCards === 1
  );

  // Countdown 0 with no starts_at = open waiting room (first buy). Only lock once timer was set and elapsed.
  const waitingCountdownElapsed = Boolean(
    roomInfo?.startsAt &&
    roomInfo.status === "waiting" &&
    countdownSeconds === 0
  );
  const minPlayersToStart = roomInfo?.minPlayers ?? 0;
  const spectatorQueueExpired = Boolean(
    roomId &&
    resolvedUserId &&
    !hasReservedCardsForCurrentUser &&
    waitingSpectator &&
    countdownSeconds === 0 &&
    (waitingCountdownElapsed ||
      hadPositiveCountdownRef.current ||
      countdownDeadline != null ||
      shouldEnterLiveRoom(gameMode, roomInfo?.status) ||
      (totalPlayersWithCards > 0 &&
        (minPlayersToStart <= 0 || totalPlayersWithCards >= minPlayersToStart)))
  );

  useEffect(() => {
    if (!spectatorQueueExpired) return;
    if (releasedTemplateIdRef.current && !roomId) return;
    bounceSpectatorToTemplate(roomInfo?.templateId);
  }, [
    spectatorQueueExpired,
    roomId,
    roomInfo?.templateId,
  ]);

  const refreshAutoBuySnapshot = async (
    templateId?: string | null
  ): Promise<AutoBuySnapshot | null> => {
    if (!templateId || isHardExiting()) return null;
    try {
      const snapshot = await fetchAutoBuySnapshot(templateId);
      setAutoBuySnapshot(snapshot);
      return snapshot;
    } catch (err) {
      console.warn("[AutoBuy] snapshot refresh failed", err);
      return null;
    }
  };

  useEffect(() => {
    if (!roomInfo?.templateId) {
      setAutoBuySnapshot({ active: false });
      return;
    }
    void refreshAutoBuySnapshot(roomInfo.templateId);
  }, [roomInfo?.templateId]);

  useEffect(() => {
    if (!autoBuySnapshot.active || !roomInfo?.templateId) {
      return;
    }
    const timer = setInterval(() => {
      void refreshAutoBuySnapshot(roomInfo.templateId);
    }, 15000);
    return () => clearInterval(timer);
  }, [autoBuySnapshot.active, roomInfo?.templateId]);

  useEffect(() => {
    if (!autoBuySnapshot.active || !autoBuySnapshot.lastRoomId) return;

    const nextLastRoom = autoBuySnapshot.lastRoomId;
    const prevLastRoom = autoBuyLastRoomRef.current;
    autoBuyLastRoomRef.current = nextLastRoom;

    // Only follow auto-buy when the server rebuys into a new room — not when the
    // player intentionally opens another waiting room from the lobby.
    if (!prevLastRoom || prevLastRoom === nextLastRoom) return;
    if (!roomId || nextLastRoom === roomId) return;

    router.replace(`/player/gameroom?roomId=${nextLastRoom}`);
  }, [autoBuySnapshot.active, autoBuySnapshot.lastRoomId, roomId, router]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const syncAfterForeground = async () => {
      if (isHardExiting()) return;
      if (document.visibilityState !== "visible") return;

      void fetchRoomDataRef.current("recovery");
      invalidateActiveGames?.();

      const info = roomInfoRef.current;
      const templateId = info?.templateId;
      if (!templateId || !roomId) return;

      const snapshot = await refreshAutoBuySnapshot(templateId);
      if (!snapshot?.active || !snapshot.lastRoomId) return;
      if (snapshot.lastRoomId === roomId) return;

      const currentStatus = (info?.status ?? "").toLowerCase();
      const stuckOnLiveRoom =
        currentStatus === "playing" ||
        currentStatus === "running" ||
        currentStatus === "settling";

      if (!stuckOnLiveRoom) return;

      autoBuyLastRoomRef.current = snapshot.lastRoomId;
      router.replace(`/player/gameroom?roomId=${snapshot.lastRoomId}`);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncAfterForeground();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        void syncAfterForeground();
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onVisible);

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onVisible);
    };
  }, [roomId, router, invalidateActiveGames]);

  const handleAutoBuyStart = async (params: {
    fundAmount: number;
    cardCount: number;
    profitTarget: number;
    serialBuyEnabled: boolean;
  }) => {
    if (!roomInfo?.templateId) {
      toast.error("اطلاعات اتاق ناقص است");
      return;
    }

    if (params.serialBuyEnabled && !roomId) {
      toast.error("برای خرید سریالی باید داخل همان گیم‌روم باشید");
      return;
    }

    try {
      const result = await startAutoBuy({
        templateId: roomInfo.templateId,
        fundAmount: params.fundAmount,
        cardCount: params.cardCount,
        profitTarget: params.profitTarget,
        skipFirstJoin: hasReservedCardsForCurrentUser,
        serialBuyEnabled: params.serialBuyEnabled,
        anchorRoomId: params.serialBuyEnabled ? roomId ?? undefined : undefined,
        idempotencyKey:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}`,
      });

      setAutoBuySnapshot({
        active: result.status === "running",
        sessionId: result.sessionId,
        templateId: roomInfo.templateId,
        status: result.status,
        cardCount: result.cardCount,
        fundInitial: result.fundInitial,
        fundRemaining: result.fundRemaining,
        inPlayCost:
          result.lastRoomId && result.cardCount
            ? roomInfo.cardPrice * result.cardCount
            : 0,
        roundsWon: 0,
        roundsLost: 0,
        roundsTotal: 0,
        profitTarget: result.profitTarget,
        lastRoomId: result.lastRoomId,
        serialBuyEnabled: result.serialBuyEnabled,
        anchorRoomId: result.anchorRoomId,
        serialNextRoomId: result.serialNextRoomId,
      });

      toast.success("خرید اتوماتیک شروع شد");

      void Promise.resolve(refreshWalletBalances?.()).catch(() => {});
      invalidateActiveGames?.();

      if (result.lastRoomId && result.lastRoomId !== roomId) {
        router.replace(`/player/gameroom?roomId=${result.lastRoomId}`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "خطا در شروع خرید اتوماتیک";
      toast.error(message);
      throw err;
    }
  };

  const handleAutoBuyStop = async () => {
    if (!roomInfo?.templateId) {
      toast.error("اطلاعات اتاق ناقص است");
      return;
    }

    try {
      await stopAutoBuy({ templateId: roomInfo.templateId });
      await refreshAutoBuySnapshot(roomInfo.templateId);
      toast.success("خرید اتوماتیک متوقف شد");
      void Promise.resolve(refreshWalletBalances?.()).catch(() => {});
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "خطا در توقف خرید اتوماتیک";
      toast.error(message);
      throw err;
    }
  };

  // مدیریت افزودن به لیست (خرید کارت) یا لغو رزرو
  const handleAddToList = async (
    selectedQuantity: number,
    roomPassword?: string
  ) => {
    if (!roomInfo || !roomInfo.templateId) {
      toast.error("اطلاعات روم ناقص است");
      return;
    }
  
    const isCancelMode = canCancel;

    if (!isCancelMode && globalRegistrationLocked) {
      toast.error("ثبت نام بازی توسط ادمین موقتاً قفل شده است");
      return;
    }

    if (roomInfo.requiresPassword && !roomPassword?.trim()) {
      toast.error("رمز اتاق الزامی است");
      return;
    }
  
    try {
      // --- حالت لغو رزرو ---
      if (isCancelMode && roomId) {
        await cancelWaitingRoom(roomId);
        toast.success("رزرو شما لغو شد");
        await refreshWalletBalances?.();
        invalidateActiveGames?.();
        setTimeout(() => {
          invalidateActiveGames?.();
        }, 800);
        router.push("/player/lobby");
        return;
      }

      // --- حالت خرید کارت ---
      console.log("[JOIN_RPC][START]", {
        templateId: roomInfo.templateId,
        cardCount: selectedQuantity,
        at: new Date().toISOString(),
      });

      const result = await joinOrCreateRoom({
        templateId: roomInfo.templateId,
        cardCount: selectedQuantity,
        password: roomPassword,
      });

      console.log("[JOIN_RPC][DONE]", {
        room_id: result?.room_id ?? null,
        at: new Date().toISOString(),
      });

      // تعیین roomId مقصد. اگر RPC مستقیماً room_id برنگرداند (مثلاً شکل خروجی فرق کند)،
      // از روی templateId همان روم واقعی را واکشی می‌کنیم — دقیقاً مثل مسیری که هنگام رفرش دستی کار می‌کند.
      let targetRoomId = (result?.room_id || "").trim();
      if (!targetRoomId && !roomId && roomInfo.templateId) {
        try {
          const view = await fetchGameRoomView({ templateId: roomInfo.templateId });
          if (view.mode !== "preview" && view.room.id) {
            targetRoomId = String(view.room.id);
          }
        } catch (resolveErr) {
          console.warn("[JOIN_RPC][RESOLVE_ROOM_FALLBACK_FAILED]", resolveErr);
        }
      }

      toast.success(`${selectedQuantity} کارت با موفقیت خریداری شد`);

      // ناوبری قطعی به روم واقعی — قبل از هر await دیگری تا با خطای احتمالی (مثل refreshWalletBalances) بلاک نشود.
      // در حالت template هنوز roomId نداریم؛ این صفحه را از templateId به roomId می‌برد.
      console.log("[JOIN_RPC][NAVIGATE]", {
        targetRoomId,
        currentRoomId: roomId ?? null,
        willNavigate: Boolean(targetRoomId && targetRoomId !== roomId),
        at: new Date().toISOString(),
      });
      if (targetRoomId && targetRoomId !== roomId) {
        router.replace(`/player/gameroom?roomId=${targetRoomId}`);
      }

      // چیپ فعال را فوری نشان بده؛ snapshot بعدی لیست را اصلاح می‌کند.
      if (targetRoomId) {
        const prevUserCards =
          targetRoomId === roomId && resolvedUserId
            ? cardsToRenderForCancel.find((c) => c.id === resolvedUserId)?.count ?? 0
            : 0;
        const nextCardCount = Math.max(1, prevUserCards + selectedQuantity);
        upsertOptimisticActiveRoom?.({
          roomId: targetRoomId,
          roomCode: roomInfo.roomCode || null,
          status: (["waiting", "playing", "live", "settling"].includes(roomInfo.status)
            ? roomInfo.status
            : "waiting") as "waiting" | "playing" | "live" | "settling",
          cardPrice: roomInfo.cardPrice,
          currency: roomInfo.currency,
          cardCount: nextCardCount,
          prize: roomInfo.cardPrice * nextCardCount,
          roomType: roomInfo.roomType || "normal",
          templateId: roomInfo.templateId || null,
        });
      } else {
        invalidateActiveGames?.();
      }

      // رفرش کیف پول به‌صورت غیرمسدودکننده — نباید جلوی ناوبری بالا را بگیرد.
      void Promise.resolve(refreshWalletBalances?.()).catch((walletErr) => {
        console.warn("[JOIN_RPC][WALLET_REFRESH_FAILED]", walletErr);
      });

      // Snapshot confirm (در صورت تاخیر commit سرور یک بار دیگر)
      setTimeout(() => {
        invalidateActiveGames?.();
      }, 800);
    } catch (error: any) {
      console.error("[JOIN_RPC][ERROR]", error);
      toast.error(error.message || "خطا در خرید کارت");
    }
  };
  
  // مدیریت کلیک روی میز
  const handleTableClick = (tableId: string) => {
    router.push(
      `/player/gameroom?roomId=${encodeURIComponent(tableId)}&spectate=1`
    );
  };

  const isTournamentRoom =
    (roomInfo.roomType || "").toLowerCase() === "tournament";
  const purchaseLockedByAdmin = globalRegistrationLocked && !canCancel;
  const shellPurchaseBlocked = roomInfo.cardPrice <= 0 && !hasLiveSnapshot;
  const tourReady =
    hasLiveSnapshot &&
    !isTournamentRoom &&
    !purchaseLockedByAdmin;
  useAutoStartTour(GAME_ROOM_TOUR_ID, tourReady, { preferQueuedIntent: true });

  const autoBuyPanelAvailable =
    !isTournamentRoom &&
    !roomInfo.requiresPassword &&
    !purchaseLockedByAdmin;

  // استفاده از cardsToRenderForCancel که قبلاً تعریف شده
  const cardsToRender = spectatorQueueExpired ? [] : cardsToRenderForCancel;

  return (
    <div className={styles.root}>
      <div className="px-4 space-y-1 pt-4">
        {snapshotError && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-white text-right">
            {snapshotError}
          </div>
        )}
        {purchaseLockedByAdmin && (
          <div className="rounded-xl border border-red-500/50 bg-amber-500/10 px-3 py-2 text-sm text-white text-right">
            {globalRegistrationLockReason
              ? globalRegistrationLockReason
              : "ثبت نام در همه بازی‌ها موقتاً توسط ادمین قفل شده است."}
          </div>
        )}
        {!isTournamentRoom && (
          <BuyCardsPanel
            price={roomInfo.cardPrice}
            minQuantity={1}
            maxQuantity={roomInfo.maxPlayers || 10}
            maxBuy={roomInfo.maxPlayers || 10}
            requiresPassword={Boolean(roomInfo.requiresPassword)}
            musicEnabled={isMusicEnabled}
            onToggleMusic={roomId ? handleToggleMusic : undefined}
            showMusicToggle
            onConfirm={handleAddToList}
            disabled={
              shellPurchaseBlocked ||
              purchaseLockedByAdmin ||
              Boolean(
                roomId &&
                  !canCancel &&
                  (roomInfo.status !== "waiting" || waitingCountdownElapsed)
              )
            }
            autoBuyDisabled={
              purchaseLockedByAdmin || roomInfo.status !== "waiting"
            }
            mode={canCancel ? "cancel" : "purchase"}
            actionLabel={
              canCancel
                ? "لغو رزرو"
                : purchaseLockedByAdmin
                  ? "ثبت نام قفل است"
                  : undefined
            }
            autoBuy={
              autoBuyPanelAvailable || autoBuySnapshot.active
                ? {
                    available: autoBuyPanelAvailable,
                    running: autoBuySnapshot.active,
                    snapshot: autoBuySnapshot,
                    hasReservedCards: hasReservedCardsForCurrentUser,
                    onStart: handleAutoBuyStart,
                    onStop: handleAutoBuyStop,
                  }
                : undefined
            }
          />
        )}

        <ActiveCardsStatus
          cards={cardsToRender}
          secondsRemaining={countdownSeconds}
          minPlayers={roomInfo.minPlayers}
          loading={activeCardsLoading}
        />

        {!isTournamentRoom && (
          <ActiveTablesSection
            tables={activeTables}
            loading={activeTablesLoading}
            onTableClick={handleTableClick}
          />
        )}
      </div>
    </div>
  );
}

