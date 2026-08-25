import { createHash } from "crypto";
import type { CachedActiveRoom } from "./myActiveRoomsCache";

export type ActiveRoomRow = {
  room_id: string;
  room_code: string | null;
  status: string;
  card_price: number | string | null;
  currency: string | null;
  card_count: number | string | null;
  prize: number | string | null;
  room_type: string | null;
  template_id?: string | null;
  template_table_index?: number | string | null;
};

const STATUS_ORDER: Record<CachedActiveRoom["status"], number> = {
  live: 0,
  playing: 1,
  waiting: 2,
  settling: 3,
};

export function mapRpcToActiveRooms(rows: ActiveRoomRow[]): CachedActiveRoom[] {
  const activeRooms: CachedActiveRoom[] = rows.map((room) => ({
    roomId: room.room_id,
    roomCode: room.room_code,
    status: room.status as CachedActiveRoom["status"],
    cardPrice: Number(room.card_price || 0),
    currency: room.currency || "IRR",
    cardCount: Number(room.card_count || 0),
    prize: Number(room.prize || 0),
    roomType: room.room_type || "normal",
    templateId: room.template_id || null,
    templateTableIndex: Math.max(1, Number(room.template_table_index || 1)),
  }));

  activeRooms.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return activeRooms;
}

export function computeActiveRoomsEtag(rooms: CachedActiveRoom[]): string {
  const payload = JSON.stringify(rooms);
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function parseIfNoneMatch(header: string | null): string[] {
  if (!header) return [];

  return header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((tag) => {
      let t = tag;
      if (t.startsWith("W/")) t = t.slice(2).trim();
      if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
        t = t.slice(1, -1);
      }
      return t;
    });
}

export function ifNoneMatchHits(candidates: string[], etagValue: string): boolean {
  const etagHeader = `"${etagValue}"`;
  return candidates.includes(etagValue) || candidates.includes(etagHeader);
}
