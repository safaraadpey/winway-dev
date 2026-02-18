"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useHeaderVisibility } from "@/lib/contexts/HeaderVisibilityContext";
import { useBalancesContext } from "@/lib/contexts/BalancesContext";
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
  loadRoomActiveCards,
  type RoomInfo,
  fetchGameRoomView,
  type GameRoomView,
  cancelWaitingRoom,
} from "@/services/rooms";
import toast from "react-hot-toast";
import LiveRoomScreen from "@/src/screens/LiveRoomScreen";
import {
  playLiveRoomMusic,
  stopLiveRoomMusic,
  getMusicVolumeValue,
  setMusicVolumeValue,
} from "@/lib/audio/music";

interface GameRoomScreenProps {
  roomId?: string;
  templateId?: string;
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

  const activeStatuses = ["reserved"];

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
export default function GameRoomScreen({ roomId, templateId }: GameRoomScreenProps) {
  const router = useRouter();
  const { setShowBackButton } = useHeaderVisibility();
  const { refreshWalletBalances } = useBalancesContext();
  useScreenWakeLock(Boolean(roomId));

  // State برای اطلاعات روم
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [loading, setLoading] = useState(true);

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

const MUSIC_PREF_KEY = "gameroom_music_enabled";

function readStoredMusicEnabled() {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(MUSIC_PREF_KEY);
    if (raw === null) return true; // پیش‌فرض: روشن
    return raw === "true";
  } catch {
    return true;
  }
}

function writeStoredMusicEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUSIC_PREF_KEY, String(Boolean(enabled)));
  } catch {
    // ignore
  }
}

// Music toggle for real rooms (roomId mode only)
const [isMusicEnabled, setIsMusicEnabled] = useState(() => {
  if (roomId && !templateId) {
    return readStoredMusicEnabled();
  }
  return false;
});

  const handleToggleMusic = () => {
    setIsMusicEnabled((prev) => {
      if (!roomId || templateId) return false;
      const next = !prev;
      if (next) {
        // If volume was muted globally (e.g., from LiveRoom slider), restore a sensible default
        const currentVol = getMusicVolumeValue();
        if (currentVol <= 0.001) {
          setMusicVolumeValue(0.15);
        }
      }
      writeStoredMusicEnabled(next);
      return next;
    });
  };

  // Ref برای نگه‌داری مقادیر قبلی برای مقایسه در render
  const prevRenderValuesRef = useRef<{
    activeCards: ActiveCardStatus[];
    realtimeActiveCards: ActiveCardStatus[];
    cardsToRender: ActiveCardStatus[];
  } | null>(null);

  // بارگذاری اطلاعات روم یا تمپلیت
  useEffect(() => {
    async function fetchRoomData(isInitial: boolean) {
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

        // اگر با templateId وارد شده‌ایم و سرور روم واقعی برگردانده، redirect به roomId
        if (!roomId && templateId && view.mode !== "preview" && view.room.id) {
          router.replace(`/player/gameroom?roomId=${view.room.id}`);
          return;
        }

        // نگاشت GameRoomView به RoomInfo (برای سازگاری UI فعلی)
        let mappedRoom: RoomInfo | null = null;

        if (view.mode === "preview") {
          mappedRoom = {
            id: view.room.template_id,
            roomCode: "",
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

        // Poll log فقط زمانی که roomId معتبر داریم (جلوگیری از نویز: roomId undefined)
        if (roomId) {
          console.log("[POLL][ROOM]", {
            roomId,
            at: new Date().toISOString(),
            activeCardsCount: view.active_cards?.length,
            players: view.active_cards?.map((card) => ({
              playerId: card.user_id,
              cards: card.card_count,
            })),
          });
        }

        setRoomInfo(mappedRoom);

        // محاسبه server offset و deadline برای countdown
        const serverNow = new Date(view.server_now).getTime();
        const clientNow = Date.now();
        const offset = serverNow - clientNow;
        setServerOffset(offset);

        // محاسبه deadline: از starts_at استفاده کن اگر موجود باشد، وگرنه از countdown_seconds
        let deadline: number;
        if (view.room.starts_at) {
          deadline = new Date(view.room.starts_at).getTime();
        } else {
          deadline = serverNow + (view.countdown_seconds || 0) * 1000;
        }
        setCountdownDeadline(deadline);

        // نگاشت کارت‌های فعال
        const activeCardsList: ActiveCardStatus[] = view.active_cards.map(
          (card: GameRoomView["active_cards"][number]) => ({
            id: card.user_id,
            title: card.display_name,
            count: card.card_count,
          })
        );
        console.log("[DEBUG][POLL_DATA]", {
          activeCardsFromAPI: activeCardsList,
          length: activeCardsList.length,
          at: new Date().toISOString(),
        });
        setActiveCards(activeCardsList);
        setRealtimeActiveCards(activeCardsList);
        console.log("[COMPARE_AFTER_POLL]", {
          apiCount: activeCardsList.length,
          rtCount: realtimeActiveCards.length,
          at: new Date().toISOString(),
        });
        console.log("[COMPARE][ACTIVE_CARDS]", {
          at: new Date().toISOString(),
          poll: activeCardsList,
          realtime: realtimeActiveCards,
        });

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

    // بارگذاری اولیه با spinner
    fetchRoomData(true);

    // Polling فقط وقتی roomId داریم (اگر undefined باشد، interval ساخته نمی‌شود)
    if (!roomId) {
      return;
    }

    // به‌روزرسانی هر 20 ثانیه بدون نمایش spinner تمام‌صفحه
    const interval = setInterval(() => fetchRoomData(false), 20000);
    return () => clearInterval(interval);
  }, [roomId, templateId, router]);

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

  // فعال کردن دکمه back در header
  useEffect(() => {
    setShowBackButton(true);
    return () => {
      setShowBackButton(false);
    };
  }, [setShowBackButton]);

  // در حالت roomId، وضعیت ترجیح کاربر را از localStorage می‌خوانیم؛ پیش‌فرض: روشن
  useEffect(() => {
    if (!roomId || templateId) return;

    const stored = readStoredMusicEnabled();
    setIsMusicEnabled(stored);

    if (stored) {
      const currentVol = getMusicVolumeValue();
      if (currentVol <= 0.001) {
        setMusicVolumeValue(0.15);
      }
    }
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
      console.log("[DEBUG][RT_PAYLOAD]", {
        eventType: payload.eventType,
        new: payload.new,
        old: payload.old,
        at: new Date().toISOString(),
        realtimeActiveCards_before: realtimeActiveCards,
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
        const activeStatuses = ["reserved"];

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

        console.log("[DEBUG][RT_APPLY]", {
          prev,
          payload,
          updated,
        });

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

        return {
          ...prev,
          status: newRoom.status ?? prev.status,
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
        const deadline = new Date(newRoom.starts_at).getTime();
        setCountdownDeadline(deadline);
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
  }, [roomId, supabase]);

  // محاسبه cardsToRender برای استفاده در محاسبه canCancel
  const cardsToRenderForCancel =
    realtimeActiveCards.length > 0 ? realtimeActiveCards : activeCards;

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
  
    try {
      // --- حالت لغو رزرو ---
      if (isCancelMode && roomId) {
        await cancelWaitingRoom(roomId);
        toast.success("رزرو شما لغو شد");
        await refreshWalletBalances?.();
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

      toast.success(`${selectedQuantity} کارت با موفقیت خریداری شد`);
      await refreshWalletBalances?.();
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
    return (
      <div className="overflow-hidden bg-black/40 min-h-screen">
        <div className="px-4 space-y-1 pt-1">
          {/* Panel 1: BuyCardsPanel skeleton (no images, UI-only) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex flex-col items-center rounded-full border border-white/10 px-3 py-1 text-white">
                <div className="h-3 w-16 rounded-full bg-white/10 animate-pulse" />
                <div className="mt-2 h-6 w-10 rounded-full bg-white/10 animate-pulse" />
              </div>

              <div className="rounded-full px-2 py-2 flex items-center justify-center gap-4 border border-white/10 bg-black/20">
                <button
                  disabled
                  aria-label="کاهش"
                  className="w-12 h-12 rounded-full bg-white/5 opacity-60 cursor-not-allowed flex items-center justify-center"
                >
                  <div className="h-5 w-5 rounded-full bg-white/20 animate-pulse" />
                </button>

                <div className="h-8 w-14 rounded-lg bg-white/10 animate-pulse" />

                <button
                  disabled
                  aria-label="افزایش"
                  className="w-12 h-12 rounded-full bg-white/5 opacity-60 cursor-not-allowed flex items-center justify-center"
                >
                  <div className="h-5 w-5 rounded-full bg-white/20 animate-pulse" />
                </button>
              </div>
            </div>

            <button
              disabled
              className="w-full py-4 rounded-xl bg-white/5 text-white/70 font-bold text-lg opacity-60 cursor-not-allowed"
            >
              <span className="flex items-center justify-center gap-2">
                <span className="h-5 w-5 rounded-full bg-white/20 animate-pulse" />
                <span className="h-5 w-40 rounded-md bg-white/10 animate-pulse" />
              </span>
            </button>
          </div>

          {/* Panel 2: ActiveCardsStatus skeleton */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 pt-5 pb-5 mt-3 h-[200px] min-h-[200px] flex flex-col space-y-3">
            <div className="flex items-center justify-between h-[39px] max-h-[40px]">
              <div className="flex items-center gap-2">
                <div className="h-10 w-28 rounded-lg bg-white/10 animate-pulse" />
                <div className="h-6 w-6 rounded-full bg-white/10 animate-pulse" />
              </div>
              <div className="h-4 w-28 rounded-md bg-white/10 animate-pulse" />
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-1.5 flex items-center justify-between bg-white/5 border border-white/10"
                >
                  <div className="h-4 w-36 rounded-md bg-white/10 animate-pulse" />
                  <div className="h-4 w-16 rounded-md bg-white/10 animate-pulse" />
                </div>
              ))}
            </div>
          </div>

          {/* Panel 3: ActiveTablesSection skeleton */}
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 pt-[4px] pb-[6px] mt-[9px] min-h-[200px] space-y-3">
            {/* title skeleton (no real text during loading) */}
            <div className="pt-2">
              <div className="h-4 w-28 mx-auto rounded-md bg-white/10 animate-pulse" />
            </div>

            <div
              className="space-y-2 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              style={{ maxHeight: "146px" }}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-lg px-3 py-1.5 flex items-center justify-between bg-white/5 border border-white/10"
                >
                  <div className="h-4 w-20 rounded-md bg-white/10 animate-pulse" />
                  <div className="flex items-center gap-4">
                    <div className="h-4 w-14 rounded-md bg-white/10 animate-pulse" />
                    <div className="h-4 w-14 rounded-md bg-white/10 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const normalizedStatus = (roomInfo.status || "").toLowerCase();
  const isLiveRoom =
    roomId &&
    ["running", "playing", "live", "finished", "settling"].some((status) =>
      normalizedStatus.includes(status)
    );

  if (isLiveRoom) {
    return <LiveRoomScreen roomId={roomId!} />;
  }

  // استفاده از cardsToRenderForCancel که قبلاً تعریف شده
  const cardsToRender = cardsToRenderForCancel;

  // لاگ فقط در صورت تغییر واقعی
  const prev = prevRenderValuesRef.current;
  const hasChanged =
    !prev ||
    JSON.stringify(prev.activeCards) !== JSON.stringify(activeCards) ||
    JSON.stringify(prev.realtimeActiveCards) !== JSON.stringify(realtimeActiveCards) ||
    JSON.stringify(prev.cardsToRender) !== JSON.stringify(cardsToRender);

  if (hasChanged) {
    console.log("[RENDER_CHANGED]", {
      activeCards,
      realtimeActiveCards,
      cardsToRender,
    });
    prevRenderValuesRef.current = {
      activeCards,
      realtimeActiveCards,
      cardsToRender,
    };
  }

  return (
    <div className="overflow-hidden bg-black/40 min-h-screen">
      <div className="px-4 space-y-1 pt-1">
        {/* پنل انتخاب کارت */}
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
            roomId && !canCancel
              ? countdownSeconds === 0 || roomInfo.status !== "waiting"
              : false
          }
          mode={canCancel ? "cancel" : "purchase"}
          actionLabel={canCancel ? "لغو رزرو" : undefined}
        />

        <ActiveCardsStatus cards={cardsToRender} secondsRemaining={countdownSeconds} />

        <ActiveTablesSection tables={activeTables} onTableClick={handleTableClick} />
      </div>
    </div>
  );
}

