/** Row shapes for the game-data tables the engine reads/writes. */

export type RoomStatus =
  | "waiting"
  | "playing"
  | "live"
  | "settling"
  | "finished"
  | "cancelled";

export interface RoomRow {
  id: string;
  status: RoomStatus;
  currency: string;
  room_seed: string | null;
  room_template_id: string | null;
  next_draw_at: string | null;
  starts_at: string | null;
  min_players: number | null;
  countdown_sec: number | null;
  first_line_draw_number: number | null;
  line_reward_percentage: number | null;
  full_reward_percentage: number | null;
  ding_per_number: number | null;
  meta: Record<string, unknown> | null;
}

export interface DrawRow {
  id: string;
  room_id: string;
  number: number;
  processed_at: string | null;
  ding_aggregated_at: string | null;
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
