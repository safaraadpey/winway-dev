/** PostgreSQL room-loop ownership token passed through actor mutations. */
export interface RoomLeaseFence {
  ownerId: string;
  leaseEpoch: number;
}

export function isValidFence(
  fence: RoomLeaseFence | null | undefined
): fence is RoomLeaseFence {
  return (
    fence != null &&
    typeof fence.ownerId === "string" &&
    fence.ownerId.length > 0 &&
    Number.isFinite(fence.leaseEpoch) &&
    fence.leaseEpoch > 0
  );
}
