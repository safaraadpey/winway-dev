-- Persist is_tournament on game_manifest payload so live RAM snapshots
-- can hide line winners without a separate tournament join.

BEGIN;

CREATE OR REPLACE FUNCTION game_core.fn_insert_game_manifest(p_room uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, game_core, extensions, pg_temp
AS $$
DECLARE
  v_room public.rooms%ROWTYPE;
  v_line_pct numeric;
  v_full_pct numeric;
  v_ding integer;
  v_pool_commit text;
  v_pool_prng text;
  v_seed_hex text;
  v_seed_hash text;
  v_ticket_count integer;
  v_missing_comm integer;
  v_skipped_comm integer;
  v_missing_cards integer;
  v_payload jsonb;
  v_hash text;
  v_is_tournament boolean;
BEGIN
  SELECT * INTO v_room
  FROM public.rooms
  WHERE id = p_room
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % not found', p_room;
  END IF;

  IF v_room.room_seed IS NULL THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % has no room_seed', p_room;
  END IF;

  IF v_room.pool_id IS NULL THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % has no pool_id', p_room;
  END IF;

  v_seed_hex := encode(v_room.room_seed, 'hex');
  v_seed_hash := lower(COALESCE(v_room.room_seed_hash, encode(extensions.digest(v_room.room_seed, 'sha256'), 'hex')));
  IF v_seed_hash IS DISTINCT FROM encode(extensions.digest(v_room.room_seed, 'sha256'), 'hex') THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % seed hash mismatch', p_room;
  END IF;

  SELECT cp.commit_hash, cp.prng_version
    INTO v_pool_commit, v_pool_prng
  FROM public.card_pools cp
  WHERE cp.id = v_room.pool_id;

  IF v_pool_commit IS NULL THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: pool % not found', v_room.pool_id;
  END IF;

  SELECT COALESCE(r.line_reward_percentage, rt.line_reward_percentage, 0.5),
         COALESCE(r.full_reward_percentage, rt.full_reward_percentage, 0.5),
         GREATEST(COALESCE(r.ding_per_number, rt.ding_per_number, 1)::integer, 0)
    INTO v_line_pct, v_full_pct, v_ding
  FROM public.rooms r
  LEFT JOIN public.room_templates rt ON rt.id = r.room_template_id
  WHERE r.id = p_room;

  v_line_pct := GREATEST(COALESCE(v_line_pct, 0), 0);
  v_full_pct := GREATEST(COALESCE(v_full_pct, 0), 0);
  IF v_line_pct = 0 AND v_full_pct = 0 THEN
    v_line_pct := 0.5;
    v_full_pct := 0.5;
  END IF;
  IF (v_line_pct + v_full_pct) > 1 THEN
    v_line_pct := v_line_pct / (v_line_pct + v_full_pct);
    v_full_pct := 1 - v_line_pct;
  END IF;

  SELECT COUNT(*) INTO v_ticket_count
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed');

  IF v_ticket_count < 1 THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % has no eligible tickets', p_room;
  END IF;

  v_is_tournament := EXISTS (
    SELECT 1
    FROM public.tournament_round_rooms trr
    WHERE trr.room_id = p_room
  ) OR EXISTS (
    SELECT 1
    FROM public.room_templates rt
    WHERE rt.id = v_room.room_template_id
      AND rt.room_type = 'tournament'
  );

  SELECT COUNT(*) INTO v_missing_comm
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.commissions_log c WHERE c.ticket_id = t.id
    )
    AND NOT (v_is_tournament AND COALESCE(t.price, 0) = 0);

  IF v_missing_comm > 0 THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % missing commissions_log for % tickets',
      p_room, v_missing_comm;
  END IF;

  SELECT COUNT(*) INTO v_skipped_comm
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.commissions_log c WHERE c.ticket_id = t.id
    )
    AND v_is_tournament
    AND COALESCE(t.price, 0) = 0;

  IF v_skipped_comm > 0 THEN
    RAISE LOG '[Room] game_manifest skip commissions_log for tournament zero-price tickets room=% skipped=%',
      p_room, v_skipped_comm;
  END IF;

  SELECT COUNT(*) INTO v_missing_cards
  FROM public.tickets t
  WHERE t.room_id = p_room
    AND t.cancelled_at IS NULL
    AND t.reservation_status IN ('reserved', 'confirmed')
    AND NOT EXISTS (
      SELECT 1 FROM public.card_numbers cn WHERE cn.pool_card_id = t.pool_card_id
    );

  IF v_missing_cards > 0 THEN
    RAISE EXCEPTION 'fn_insert_game_manifest: room % missing card_numbers for % tickets',
      p_room, v_missing_cards;
  END IF;

  SELECT jsonb_build_object(
    'room_id', p_room,
    'room_seed', v_seed_hex,
    'room_seed_hash', v_seed_hash,
    'rng_algorithm', 'SHA256_ORDERING',
    'rng_version', 'v1',
    'manifest_version', 1,
    'pool_id', v_room.pool_id,
    'pool_commit_hash', v_pool_commit,
    'pool_prng_version', COALESCE(v_pool_prng, 'v1'),
    'ding_per_number', v_ding,
    'line_reward_percentage', v_line_pct,
    'full_reward_percentage', v_full_pct,
    'ding_settle_mode', COALESCE(v_room.ding_settle_mode, 'per_draw'),
    'currency', v_room.currency,
    'card_price', v_room.card_price,
    'is_tournament', v_is_tournament,
    'commission_pool', (
      SELECT COALESCE(SUM(c.amount_to_pool), 0)
      FROM public.tickets t
      JOIN public.commissions_log c ON c.ticket_id = t.id
      WHERE t.room_id = p_room
        AND t.cancelled_at IS NULL
        AND t.reservation_status IN ('reserved', 'confirmed')
    ),
    'commissions', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'ticket_id', t.id,
          'amount_to_pool', c.amount_to_pool
        ) ORDER BY t.id
      ), '[]'::jsonb)
      FROM public.tickets t
      JOIN public.commissions_log c ON c.ticket_id = t.id
      WHERE t.room_id = p_room
        AND t.cancelled_at IS NULL
        AND t.reservation_status IN ('reserved', 'confirmed')
    ),
    'tickets', (
      SELECT COALESCE(jsonb_agg(ticket_obj ORDER BY ticket_id), '[]'::jsonb)
      FROM (
        SELECT t.id AS ticket_id,
               jsonb_build_object(
                 'ticket_id', t.id,
                 'user_id', t.player_user_id,
                 'pool_card_id', t.pool_card_id::text,
                 'card_no', t.card_no,
                 'price', t.price,
                 'grid_fingerprint', encode(
                   extensions.digest(
                     (
                       SELECT string_agg(
                         cn.row_no::text || ':' || cn.col_no::text || ':' || cn.value::text,
                         ','
                         ORDER BY cn.row_no, cn.col_no, cn.value
                       )
                       FROM public.card_numbers cn
                       WHERE cn.pool_card_id = t.pool_card_id
                     )::bytea,
                     'sha256'
                   ),
                   'hex'
                 )
               ) AS ticket_obj
        FROM public.tickets t
        WHERE t.room_id = p_room
          AND t.cancelled_at IS NULL
          AND t.reservation_status IN ('reserved', 'confirmed')
      ) s
    )
  )
  INTO v_payload;

  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  INSERT INTO public.game_manifests (
    room_id, manifest_version, rng_algorithm, rng_version, payload, payload_sha256
  ) VALUES (
    p_room, 1, 'SHA256_ORDERING', 'v1', v_payload, v_hash
  );
END;
$$;

COMMIT;
