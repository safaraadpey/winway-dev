/** Per-room stable offset in [-300, +300] ms (spreads concurrent rooms). */
export function stableRoomJitterMs(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    hash = (hash * 31 + roomId.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 601) - 300;
}

/** Stable per-room offset plus small random jitter in [-100, +100] ms. */
export function drawScheduleJitterMs(
  roomId: string,
  random: () => number = Math.random
): number {
  const stable = stableRoomJitterMs(roomId);
  const rand = Math.floor(random() * 201) - 100;
  return stable + rand;
}

export function addSecondsWithJitter(
  base: Date,
  seconds: number,
  roomId: string,
  random?: () => number
): string {
  const jitterMs = drawScheduleJitterMs(roomId, random);
  return new Date(base.getTime() + seconds * 1000 + jitterMs).toISOString();
}
