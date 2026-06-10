
"use client";

import { useEffect, useMemo, useState } from "react";
import BingoCard, { type BingoCardData } from "@/components/BingoCard";
import { sortDraws } from "@/lib/draw-order";
import { fetchLiveRoomSnapshot, type LiveRoomSnapshot } from "@/services/rooms";

interface GamePageProps {
  params: {
    roomId: string;
  };
}

export default function GamePage({ params }: GamePageProps) {
  const [snapshot, setSnapshot] = useState<LiveRoomSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await fetchLiveRoomSnapshot(params.roomId);
        if (!isMounted) return;
        setSnapshot(data);
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || "خطا در بارگذاری اطلاعات اتاق");
        setSnapshot(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, [params.roomId]);

  const calledNumbers = useMemo(
    () => sortDraws(snapshot?.draws ?? []).map((d) => d.number),
    [snapshot]
  );

  // اولویت: کارت‌های خود کاربر (is_my_card) → اگر نبود، اولین کارت موجود
  const myCard = useMemo(() => {
    const cards = snapshot?.cards ?? [];
    return cards.find((c) => c.is_my_card) ?? cards[0] ?? null;
  }, [snapshot]);

  const card: BingoCardData | null = myCard?.card ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-gray-900">
          Bingo Game - Room {params.roomId}
        </h2>
        <p className="mt-2 text-gray-600">
          Mark your numbers as they are called
        </p>
      </div>

      <div className="flex justify-center">
        {loading ? (
          <div className="text-gray-600">در حال بارگذاری کارت...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : !card ? (
          <div className="text-gray-600">کارت برای نمایش موجود نیست.</div>
        ) : (
          <BingoCard
            card={card}
            calledNumbers={calledNumbers}
            playerName={myCard?.player_name}
            cardNumber={myCard?.card_number ?? undefined}
            ticketId={myCard?.ticket_id}
            isMyCard={myCard?.is_my_card ?? true}
          />
        )}
      </div>
    </div>
  );
}

