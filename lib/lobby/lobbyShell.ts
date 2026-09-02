/**
 * Instant lobby shell: static catalog + localStorage cache for first paint.
 * Live counters / entryRoomId / templateId are hydrated from lobby-snapshot in the background.
 */

export type LobbyRoomGroupShell = {
  price: number;
  currency: string;
  roomName?: string | null;
  waitingRooms: number;
  playingRooms: number;
  totalRooms: number;
  players: number;
  waitingPlayers: number;
  playingPlayers: number;
  templateId?: string | null;
  entryRoomId?: string | null;
};

const LOBBY_SHELL_STORAGE_KEY = "winway.lobby.shell.v1";

/** Matches artwork order in LobbyRoomCard (5/6/8/10/11/20/21). */
const STATIC_LOBBY_CATALOG: ReadonlyArray<{
  price: number;
  roomName: string;
}> = [
  { price: 5000, roomName: "پنج هزار" },
  { price: 6000, roomName: "شش هزار" },
  { price: 8000, roomName: "هشت هزار" },
  { price: 10000, roomName: "ده هزار" },
  { price: 11000, roomName: "یازده هزار" },
  { price: 20000, roomName: "بیست هزار" },
  { price: 21000, roomName: "بیست و یک هزار" },
];

function emptyLiveCounters(): Pick<
  LobbyRoomGroupShell,
  | "waitingRooms"
  | "playingRooms"
  | "totalRooms"
  | "players"
  | "waitingPlayers"
  | "playingPlayers"
  | "templateId"
  | "entryRoomId"
> {
  return {
    waitingRooms: 0,
    playingRooms: 0,
    totalRooms: 0,
    players: 0,
    waitingPlayers: 0,
    playingPlayers: 0,
    templateId: null,
    entryRoomId: null,
  };
}

export function getStaticLobbyShell(): LobbyRoomGroupShell[] {
  return STATIC_LOBBY_CATALOG.map(({ price, roomName }) => ({
    price,
    currency: "IRR",
    roomName,
    ...emptyLiveCounters(),
  }));
}

export function lobbyRoomGroupKey(group: LobbyRoomGroupShell): string {
  if (group.templateId) return `tpl_${group.templateId}`;
  return `price_${group.price}_${group.currency}`;
}

function isValidRoomGroup(value: unknown): value is LobbyRoomGroupShell {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.price === "number" &&
    Number.isFinite(row.price) &&
    typeof row.currency === "string" &&
    typeof row.waitingRooms === "number" &&
    typeof row.playingRooms === "number" &&
    typeof row.totalRooms === "number" &&
    typeof row.players === "number" &&
    typeof row.waitingPlayers === "number" &&
    typeof row.playingPlayers === "number"
  );
}

export function readLobbyShellCache(): LobbyRoomGroupShell[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LOBBY_SHELL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { groups?: unknown[] };
    if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) {
      return null;
    }
    const groups = parsed.groups.filter(isValidRoomGroup);
    if (groups.length === 0) return null;
    return [...groups].sort((a, b) => a.price - b.price);
  } catch {
    return null;
  }
}

export function writeLobbyShellCache(groups: LobbyRoomGroupShell[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      LOBBY_SHELL_STORAGE_KEY,
      JSON.stringify({ groups, savedAt: Date.now() })
    );
  } catch (err) {
    console.warn("[Lobby] Failed to persist shell cache", err);
  }
}
