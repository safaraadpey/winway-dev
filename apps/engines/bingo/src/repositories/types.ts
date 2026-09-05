/** Row shapes for the game-data tables the engine reads/writes. */

export type RoomStatus =
  | "waiting"
  | "playing"
  | "live"
  | "settling"
  | "finished"
  | "cancelled";

export type DingSettleMode = "per_draw" | "room_level";
export type GameplayPersistMode = "per_draw" | "manifest_ram";

export function isManifestRamMode(
  mode: GameplayPersistMode | null | undefined
): boolean {
  return mode === "manifest_ram";
}

export interface RoomRow {
  id: string;
  status: RoomStatus;
  currency: string;
  room_seed: string | null;
  room_template_id: string | null;
  next_draw_at: string | null;
  starts_at: string | null;
  waiting_started_at: string | null;
  max_players: number | null;
  min_players: number | null;
  countdown_sec: number | null;
  first_line_draw_number: number | null;
  line_reward_percentage: number | null;
  full_reward_percentage: number | null;
  ding_per_number: number | null;
  ding_settle_mode?: DingSettleMode | null;
  gameplay_persist_mode?: GameplayPersistMode | null;
  finalization_sha256?: string | null;
  finalization_contract_version?: number | null;
  ding_settled_at?: string | null;
  ding_settlement_key?: string | null;
  meta: Record<string, unknown> | null;
  engine_owner_id?: string | null;
  engine_lease_until?: string | null;
  engine_lease_epoch?: number | null;
}

export interface RoomClaimResult {
  claimed: boolean;
  leaseEpoch: number | null;
}

export type OwnerInsertOutcome =
  | "inserted"
  | "backpressure"
  | "duplicate"
  | "not_owner"
  | "not_playing"
  | "exhausted";

export interface OwnerInsertResult {
  outcome: OwnerInsertOutcome;
  jobId: number | null;
  nextDrawAtIso: string | null;
}

export interface DrawRow {
  id: string;
  room_id: string;
  number: number;
  processed_at: string | null;
  ding_aggregated_at: string | null;
  queue_wait_ms: number | null;
  processing_ms: number | null;
  finalize_ms: number | null;
  drain_started_at: string | null;
  drain_ended_at: string | null;
  drain_duration_ms: number | null;
  first_picked_at: string | null;
  handler_started_at: string | null;
}

export interface TicketRow {
  id: string;
  room_id: string;
  player_user_id: string;
  pool_card_id: string;
  price: number;
  reservation_status: string;
  cancelled_at: string | null;
}

export interface CardNumberRow {
  pool_card_id: string;
  value: number;
  row_no: number;
}

export interface CardDefinitionMaskRow {
  pool_card_id: string;
  line1_mask: number;
  line2_mask: number;
  line3_mask: number;
  full_mask: number;
  cell_count: number;
}

export interface CardNumberIndexRow {
  value: number;
  pool_card_id: string;
  bit_position: number;
}

export interface ResultRow {
  id: string;
  room_id: string;
  user_id: string;
  ticket_id: string;
  win_type: "line" | "full";
  reward_amount: number | null;
  draw_number: number;
  paid_at: string | null;
}
