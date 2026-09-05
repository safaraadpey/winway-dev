/**
 * Registry for Engine-resident live-room RAM snapshots (manifest_ram).
 */
import type { RoomRuntimeState } from "../state/room-state.js";

export interface RamLiveRoomContext {
  state: RoomRuntimeState;
  ramNextDrawAtIso: string | null;
  eventSeq: number;
}

export interface LiveRoomRamProvider {
  getRamLiveContext(roomId: string): RamLiveRoomContext | null;
}

let provider: LiveRoomRamProvider | null = null;

export function setLiveRoomRamProvider(next: LiveRoomRamProvider | null): void {
  provider = next;
}

export function getLiveRoomRamProvider(): LiveRoomRamProvider | null {
  return provider;
}
