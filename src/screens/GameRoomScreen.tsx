"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
import { useActiveGamesContext } from "@/lib/contexts/ActiveGamesContext";
import useScreenWakeLock from "@/lib/hooks/useScreenWakeLock";
import PageLoading from "@/components/PageLoading";
import BuyCardsPanel from "@/components/room/BuyCardsPanel";
import ActiveCardsStatus, {
  ActiveCardStatus,
} from "@/components/room/ActiveCardsStatus";
import ActiveTablesSection from "@/components/room/ActiveTablesSection";
import { ActiveTable } from "@/components/ActiveTablesPanel";
import { supabase } from "@/lib/supabaseClient";
import {
  joinOrCreateRoom,
  loadRoomActiveCards,
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

interface GameRoomScreenProps {
  roomId?: string;
  templateId?: string;
  onEnterLive?: (roomId: string) => void;
}

const LIVE_ENTER_STATUSES = new Set([
  "playing",
  "running",
  "live",
  "settling",
]);

function shouldEnterLiveRoom(
  mode: GameRoomView["mode"],
  status: string | null | undefined
): boolean {
  if (mode === "running") return true;
  const normalized = (status || "").trim().toLowerCase();
  return LIVE_ENTER_STATUSES.has(normalized);
}

const LOBBY_POLL_MS = 3000;
const TRANSITION_POLL_MS = 1000;
const COUNTDOWN_ZERO_POLL_MS = 1000;

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

/** Union of players from API + realtime; per-player count = max of both sources. */
function mergeActiveCardStatuses(
  ...lists: ActiveCardStatus[][]
): ActiveCardStatus[] {
  const map = new Map<string, ActiveCardStatus>();
  for (const list of lists) {
    for (const card of list) {
      if (!card.id || card.count <= 0) continue;
      const existing = map.get(card.id);
      if (!existing || card.count > existing.count) {
        map.set(card.id, { ...card });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.title.localeCompare(b.title, "fa")
  );
}

function applyTicketEventToActiveCards(
  prev: ActiveCardStatus[],
  payload: any
): ActiveCardStatus[] {
  const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
  const newRow = payload.new as any;
  const oldRow = payload.old as any;

  const playerId =
    (newRow?.player_user_id as string | undefined) ??
    (oldRow?.player_user_id as string | undefined) ??
    null;

  if (!playerId) return prev;

  const activeStatuses = ["reserved", "confirmed", "consumed"];

  let delta = 0;

  if (eventType === "INSERT") {
    if (newRow && activeStatuses.includes(newRow.reservation_status)) {
      delta = 1;
    }
  } else if (eventType === "DELETE") {
    if (oldRow && activeStatuses.includes(oldRow.reservation_status)) {
      delta = -1;
    }
  } else if (eventType === "UPDATE") {
    const wasActive =
      oldRow && activeStatuses.includes(oldRow.reservation_status);
    const isActive =
      newRow && activeStatuses.includes(newRow.reservation_status);

    if (!wasActive && isActive) {
      delta = 1;
    } else if (wasActive && !isActive) {
      delta = -1;
    }
  }

  if (delta === 0) return prev;

  const current = [...prev];
  const idx = current.findIndex((c) => c.id === playerId);
  const prevCount = idx === -1 ? 0 : current[idx].count;
  const nextCount = prevCount + delta;

  if (nextCount <= 0) {
    if (idx !== -1) current.splice(idx, 1);
    return current;
  }

  const title =
    newRow?.display_name ||
    oldRow?.display_name ||
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

  return current;
}

/**
 * صفحه اصلی Game Room
 * شامل تمام کامپوننت‌های مربوط به انتخاب کارت و مشاهده میزهای فعال
 */
export default function GameRoomScreen({
  roomId,
  templateId,
  onEnterLive,
}: GameRoomScreenProps) {
  const router = useRouter();
  const { refreshWalletBalances } = useBalancesContext();
  const { invalidate: invalidateActiveGames } = useActiveGamesContext();
  useScreenWakeLock(Boolean(roomId));

  // State برای اطلاعات روم
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [gameMode, setGameMode] = useState<GameRoomView["mode"]>("preview");
  const enteredLiveRef = useRef(false);
  const fetchRoomDataRef = useRef<(isInitial: boolean) => Promise<void>>(async () => {});
  const pollIntervalMsRef = useRef(LOBBY_POLL_MS);
  const [loading, setLoading] = useState(true);
  const [globalRegistrationLocked, setGlobalRegistrationLocked] = useState(false);
  const [globalRegistrationLockReason, setGlobalRegistrationLockReason] = useState<string | null>(null);

  // State برای شمارش معکوس
  const [countdownSeconds, setCountdownSeconds] = useState<number>(0);
  const [countdownDeadline, setCountdownDeadline] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState<number>(0);

  // State برای کارت‌های فعال
  const [activeCards, setActiveCards] = useState<ActiveCardStatus[]>([]);
  const [realtimeActiveCards, setRealtimeActiveCards] = useState<ActiveCardStatus[]>([]);

  // State برای میزهای فعال
  const [activeTables, setActiveTables] = useState<ActiveTable[]>([]);

  // State برای شناسه کاربر فعلی
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

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
    onEnterLive?.(roomId);
  };

  // بارگذاری اطلاعات روم یا تمپلیت
  useEffect(() => {
    async function fetchRoomData(isInitial: boolean) {
      if (isHardExiting()) return;
      try {
        if (isInitial) {
          setLoading(true);
        }

        if (!roomId && !templateId) {
          console.warn("[GAME_ROOM][INVALID_STATE]: No roomId and no templateId");
          toast.error("ورود به اتاق نامعتبر است");
          if (isInitial) {
            setLoading(false);
          }
          return;
        }

        // گرفتن GameRoomView از API
        const view: GameRoomView = await fetchGameRoomView({
          roomId,
          templateId,
        });

        if (roomId && view.room.id && view.room.id !== roomId) {
          console.warn("[GAME_ROOM][ROOM_ID_MISMATCH]", {
            requestedRoomId: roomId,
            returnedRoomId: view.room.id,
            mode: view.mode,
          });
          return;
        }

        // اگر با templateId وارد شده‌ایم و سرور روم واقعی برگردانده، redirect به roomId
        if (!roomId && templateId && view.mode !== "preview" && view.room.id) {
          router.replace(`/player/gameroom?roomId=${view.room.id}`);
          return;
        }

        // نگاشت GameRoomView به RoomInfo (برای سازگاری UI فعلی)
        let mappedRoom: RoomInfo | null = null;
        setGlobalRegistrationLocked(Boolean(view.global_registration_locked));
        setGlobalRegistrationLockReason(
          view.global_registration_lock_reason?.trim() || null
        );

        if (view.mode === "preview") {
          mappedRoom = {
            id: view.room.template_id,
            roomCode: "",
            roomType: view.room.room_type,
            title: view.room.title || undefined,
            status: "waiting", // برای فعال بودن UI مطابق رفتار قبلی
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
          };
        } else {
          // حالت‌های waiting / running / finished با روم واقعی
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
            // استفاده از max_cards_per_player از roomTemplates به جای max_players
            maxPlayers: view.room.max_cards_per_player || undefined,
            currentPlayers: view.active_cards.length,
            templateId: view.room.template_id,
            canCancel: view.can_cancel,
          };
        }

        if (!mappedRoom) {
          console.error("[GAME_ROOM][NO_ROOM_MAPPED]", {
            roomId,
            templateId,
            view,
          });
          toast.error("روم یافت نشد");
          if (isInitial) {
            setLoading(false);
          }
          return;
        }

        setRoomInfo(mappedRoom);
        setGameMode(view.mode);
        if (view.mode === "running") {
          enterLive();
        }

        // محاسبه server offset و deadline برای countdown
        const serverNow = new Date(view.server_now).getTime();
        const clientNow = Date.now();
        const offset = serverNow - clientNow;
        setServerOffset(offset);

        // sync countdown from server (includes timer extension when min_players not met)
        syncCountdownFromView(
          view,
          serverNow,
          setCountdownDeadline,
          setCountdownSeconds
        );

        // نگاشت کارت‌های فعال
        const activeCardsList: ActiveCardStatus[] = view.active_cards.map(
          (card: GameRoomView["active_cards"][number]) => ({
            id: card.user_id,
            title: card.display_name,
            count: card.card_count,
          })
        );
        setActiveCards(activeCardsList);
        setRealtimeActiveCards((prev) =>
          mergeActiveCardStatuses(activeCardsList, prev)
        );

        // نگاشت میزهای فعال
        const tables: ActiveTable[] = view.active_tables.map((table) => ({
          id: table.room_id,
          roomCode: table.room_code,
          prize: table.prize,
          players: table.players,
          cardCount: table.card_count,
        }));
        setActiveTables(tables);
      } catch (error: any) {
        console.error("Error loading room data:", error);
        toast.error(error.message || "خطا در بارگذاری اطلاعات روم");
      } finally {
        if (isInitial) {
          setLoading(false);
        }
      }
    }

    fetchRoomDataRef.current = fetchRoomData;

    // بارگذاری اولیه با spinner
    fetchRoomData(true);

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled || isHardExiting()) return;
      await fetchRoomData(false);
      if (cancelled || isHardExiting()) return;
      timeoutId = setTimeout(tick, pollIntervalMsRef.current);
    };

    timeoutId = setTimeout(tick, pollIntervalMsRef.current);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [roomId, templateId, router]);

  // Enter live only when the room actually started (not when lobby countdown hits 0).
  useEffect(() => {
    if (!roomId || enteredLiveRef.current) return;

    if (shouldEnterLiveRoom(gameMode, roomInfo?.status)) {
      enterLive();
    }
  }, [roomId, gameMode, roomInfo?.status]);

  useEffect(() => {
    if (!roomId || enteredLiveRef.current) return;

    const onDrawRow = (payload: { new: Record<string, unknown> }) => {
      if (!payload.new?.processed_at) return;
      setGameMode("running");
      setRoomInfo((prev) =>
        prev ? { ...prev, status: "playing" } : prev
      );
      enterLive();
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

  // نزدیک شروع بازی: poll سریع‌تر تا status=playing زودتر دیده شود
  useEffect(() => {
    if (!roomId || gameMode === "preview") {
      pollIntervalMsRef.current = LOBBY_POLL_MS;
      return;
    }

    const pastStartsAt = Boolean(
      roomInfo?.startsAt &&
        Date.now() + serverOffset >= Date.parse(roomInfo.startsAt)
    );
    const urgent =
      countdownSeconds <= 10 || (countdownSeconds === 0 && pastStartsAt);

    pollIntervalMsRef.current = urgent ? TRANSITION_POLL_MS : LOBBY_POLL_MS;
  }, [
    roomId,
    gameMode,
    countdownSeconds,
    roomInfo?.startsAt,
    serverOffset,
  ]);

  // Realtime: وقتی هنوز در حالت template هستیم، به INSERT روی rooms (برای این templateId) گوش می‌دهیم
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

      // به محض ساخته شدن روم واقعی، همه‌ی کلاینت‌ها به آن روم redirect می‌شوند
      router.push(`/player/gameroom?roomId=${newRoomId}`);
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
  }, [roomId, templateId, router, supabase]);

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

  // countdown به ۰ رسید → فوراً status را از سرور بگیر (انتقال به LiveRoom یا extend)
  const prevCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevCountdownRef.current !== 0 && countdownSeconds === 0) {
      void fetchRoomDataRef.current(false);
    }
    prevCountdownRef.current = countdownSeconds;
  }, [countdownSeconds]);

  // روی 00:00 گیر نکند: تا extend/start از سرور بیاید poll سریع
  useEffect(() => {
    if (!roomId || gameMode !== "waiting" || countdownSeconds > 0) {
      return;
    }

    void fetchRoomDataRef.current(false);
    const id = setInterval(() => {
      void fetchRoomDataRef.current(false);
    }, COUNTDOWN_ZERO_POLL_MS);

    return () => clearInterval(id);
  }, [roomId, gameMode, countdownSeconds]);

  useEffect(() => {
    if (!roomId) return;
  
    const handler = (payload: any) => {
      const newRoomId = (payload.new as any)?.room_id ?? null;
      const oldRoomId = (payload.old as any)?.room_id ?? null;

      const matchesRoom =
        newRoomId === roomId || oldRoomId === roomId;

      if (!matchesRoom) {
        console.log("[RT][TICKETS][IGNORED]", {
          eventType: payload.eventType,
          oldRoomId,
          newRoomId,
        });
        return;
      }

      console.log("[RT][TICKETS]", {
        eventType: payload.eventType,
        new: payload.new,
        old: payload.old,
        at: new Date().toISOString(),
      });

      setRealtimeActiveCards((prev) => {
        // استفاده از Map برای تجمیع کارت‌ها بر اساس player_user_id
        const cardsMap = new Map<string, ActiveCardStatus>();
        
        // تبدیل prev به Map
        prev.forEach((card) => {
          cardsMap.set(card.id, { ...card });
        });

        const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        const newRow = payload.new as any;
        const oldRow = payload.old as any;
        const activeStatuses = ["reserved", "confirmed", "consumed"];

        const playerId =
          (newRow?.player_user_id as string | undefined) ??
          (oldRow?.player_user_id as string | undefined) ??
          null;

        if (!playerId) return prev;

        let delta = 0;

        if (eventType === "INSERT") {
          if (newRow && activeStatuses.includes(newRow.reservation_status)) {
            delta = 1;
          }
        } else if (eventType === "DELETE") {
          if (oldRow && activeStatuses.includes(oldRow.reservation_status)) {
            delta = -1;
          }
        } else if (eventType === "UPDATE") {
          const wasActive =
            oldRow && activeStatuses.includes(oldRow.reservation_status);
          const isActive =
            newRow && activeStatuses.includes(newRow.reservation_status);

          if (!wasActive && isActive) {
            delta = 1;
          } else if (wasActive && !isActive) {
            delta = -1;
          }
        }

        if (delta === 0) return prev;

        // به‌روزرسانی Map
        const existing = cardsMap.get(playerId);
        const prevCount = existing?.count ?? 0;
        const nextCount = prevCount + delta;

        if (nextCount <= 0) {
          // حذف از Map
          cardsMap.delete(playerId);
        } else {
          // اضافه یا به‌روزرسانی در Map
          const displayName =
            newRow?.display_name ||
            oldRow?.display_name ||
            existing?.title ||
            "Player";

          cardsMap.set(playerId, {
            id: playerId,
            title: displayName,
            count: nextCount,
          });
        }

        // تبدیل Map به آرایه
        const updated = Array.from(cardsMap.values());

        return updated;
      });
    };
  
    const channel = supabase
      .channel(`room_${roomId}_tickets`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tickets" },
        handler
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets" },
        handler
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "tickets" },
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
      const newRoom = payload.new as any;
      const oldRoom = payload.old as any;

      console.log("[RT][ROOM]", {
        eventType: payload.eventType,
        new: newRoom,
        old: oldRoom,
        at: new Date().toISOString(),
      });

      // بروزرسانی roomInfo از روی payload جدید
      setRoomInfo((prev) => {
        if (!prev) return prev;
        if (prev.id !== newRoom.id) return prev;

        const nextStatus = newRoom.status ?? prev.status;
        if (nextStatus === "playing" || nextStatus === "running" || nextStatus === "live") {
          setGameMode("running");
          enterLive();
        } else if (nextStatus === "finished" || nextStatus === "settling") {
          setGameMode("finished");
        }

        return {
          ...prev,
          status: nextStatus,
          startsAt: newRoom.starts_at ?? prev.startsAt,
          endsAt: newRoom.ends_at ?? prev.endsAt,
        };
      });

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

  // محاسبه cardsToRender برای استفاده در محاسبه canCancel
  const cardsToRenderForCancel = mergeActiveCardStatuses(
    activeCards,
    realtimeActiveCards
  );

  // بررسی اینکه آیا کاربر فعلی کارت فعال دارد
  const hasReservedCardsForCurrentUser = Boolean(
    currentUserId &&
    cardsToRenderForCancel.some((card) => card.id === currentUserId && card.count > 0)
  );
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

  // مدیریت افزودن به لیست (خرید کارت) یا لغو رزرو
  const handleAddToList = async (selectedQuantity: number) => {
    if (!roomInfo || !roomInfo.templateId) {
      toast.error("اطلاعات روم ناقص است");
      return;
    }
  
    const isCancelMode = canCancel;

    if (!isCancelMode && globalRegistrationLocked) {
      toast.error("ثبت نام بازی توسط ادمین موقتاً قفل شده است");
      return;
    }
  
    try {
      // --- حالت لغو رزرو ---
      if (isCancelMode && roomId) {
        await cancelWaitingRoom(roomId);
        toast.success("رزرو شما لغو شد");
        await refreshWalletBalances?.();
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

      // رفرش کیف پول به‌صورت غیرمسدودکننده — نباید جلوی ناوبری بالا را بگیرد.
      void Promise.resolve(refreshWalletBalances?.()).catch((walletErr) => {
        console.warn("[JOIN_RPC][WALLET_REFRESH_FAILED]", walletErr);
      });

      // تاخیر برای اطمینان از اینکه بازی جدید در سرور ساخته شده است
      setTimeout(() => {
        invalidateActiveGames?.();
      }, 800); // 800ms delay برای اینکه سرور فرصت ایجاد بازی را داشته باشد
    } catch (error: any) {
      console.error("[JOIN_RPC][ERROR]", error);
      toast.error(error.message || "خطا در خرید کارت");
    }
  };
  
  // مدیریت کلیک روی میز
  const handleTableClick = (tableId: string) => {
    router.push(`/player/gameroom?roomId=${tableId}`);
  };

  if (loading || !roomInfo) {
    return <PageLoading />;
  }

  const purchaseLockedByAdmin = globalRegistrationLocked && !canCancel;
  const isTournamentRoom = (roomInfo.roomType || "").toLowerCase() === "tournament";

  // استفاده از cardsToRenderForCancel که قبلاً تعریف شده
  const cardsToRender = cardsToRenderForCancel;

  return (
    <div className="overflow-hidden bg-black/40 min-h-screen">
      <div className="px-4 space-y-1 pt-1">
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
            musicEnabled={isMusicEnabled}
            onToggleMusic={roomId ? handleToggleMusic : undefined}
            showMusicToggle
            onConfirm={handleAddToList}
            disabled={
              purchaseLockedByAdmin ||
              (roomId && !canCancel
                ? countdownSeconds === 0 || roomInfo.status !== "waiting"
                : false)
            }
            mode={canCancel ? "cancel" : "purchase"}
            actionLabel={
              canCancel
                ? "لغو رزرو"
                : purchaseLockedByAdmin
                  ? "ثبت نام قفل است"
                  : undefined
            }
          />
        )}

        <ActiveCardsStatus
          cards={cardsToRender}
          secondsRemaining={countdownSeconds}
          minPlayers={roomInfo.minPlayers}
        />

        {!isTournamentRoom && (
          <ActiveTablesSection tables={activeTables} onTableClick={handleTableClick} />
        )}
      </div>
    </div>
  );
}

