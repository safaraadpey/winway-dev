-- Restrict player-facing roles from reading internal/operational room columns.
-- PostgreSQL requires revoking table-level SELECT before column allowlist applies.
-- service_role / postgres / engine paths keep full table access.

BEGIN;

REVOKE SELECT ON TABLE public.rooms FROM anon, authenticated;

GRANT SELECT (
  id,
  room_code,
  title,
  status,
  created_by,
  card_price,
  currency,
  max_cards_per_player,
  max_players,
  starts_at,
  ends_at,
  meta,
  created_at,
  updated_at,
  pool_id,
  commission_rate,
  next_draw_at,
  room_template_id,
  price,
  min_players,
  countdown_sec,
  prize_paid_at,
  line_reward_percentage,
  full_reward_percentage,
  scheduled_start_time,
  ding_per_number,
  room_seed_hash,
  seed_revealed_at,
  line_prize_pool,
  full_prize_pool,
  cancelled_at,
  cancelled_by,
  cancelled_reason,
  first_line_draw_number,
  waiting_started_at
) ON TABLE public.rooms TO anon, authenticated;

COMMIT;
