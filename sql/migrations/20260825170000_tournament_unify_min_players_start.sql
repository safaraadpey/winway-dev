-- Unify tournament start quorum: one min_players_to_start gate for all
-- tournament types (free / paid / DING, with or without guarantee).
-- Under min + auto-extend on  → push start_at (repeatable, no cap).
-- Under min + auto-extend off → cancel + refund held entry locks.
-- Guarantee is no longer re-gated at payout; start implies guarantee applies.

BEGIN;

CREATE OR REPLACE FUNCTION tournament.fn_jsonb_bool(
  p_obj jsonb,
  p_key text,
  p_default boolean
) RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  IF p_obj IS NULL OR NOT (p_obj ? p_key) THEN
    RETURN p_default;
  END IF;
  IF jsonb_typeof(p_obj -> p_key) = 'null' THEN
    RETURN p_default;
  END IF;
  v_text := lower(btrim(p_obj ->> p_key));
  IF v_text IN ('true', 't', '1', 'yes') THEN
    RETURN true;
  END IF;
  IF v_text IN ('false', 'f', '0', 'no') THEN
    RETURN false;
  END IF;
  RETURN p_default;
END;
$$;

-- Legacy tournaments always extended; keep that unless explicitly disabled.
UPDATE public.tournaments
   SET meta = coalesce(meta, '{}'::jsonb)
            || jsonb_build_object('registration_extend_enabled', true),
       updated_at = now()
 WHERE NOT coalesce(meta, '{}'::jsonb) ? 'registration_extend_enabled';

-- System cancel + refund (no admin JWT). Idempotent: already-cancelled is a no-op.
CREATE OR REPLACE FUNCTION tournament.fn_cancel_under_min_players(
  p_tournament_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'game_finance', 'pg_temp'
AS $$
DECLARE
  v_row public.tournaments%ROWTYPE;
  v_count int := 0;
  r record;
  v_wallet_id uuid;
  v_wallet_currency text;
  v_tx uuid;
  v_idem text;
BEGIN
  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required';
  END IF;

  SELECT * INTO v_row
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  IF v_row.status = 'cancelled'::public.tournament_status THEN
    RETURN 0;
  END IF;

  IF v_row.status IS DISTINCT FROM 'registration_open'::public.tournament_status THEN
    RAISE EXCEPTION 'invalid status transition from % to cancelled', v_row.status;
  END IF;

  UPDATE public.tournaments
     SET status = 'cancelled'::public.tournament_status,
         updated_at = now(),
         meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
           'cancelled_reason', 'under_min_players',
           'cancelled_at', now()
         )
   WHERE id = p_tournament_id
     AND status = 'registration_open'::public.tournament_status;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT
      l.id            AS lock_id,
      l.entry_id      AS entry_id,
      l.owner_user_id AS user_id,
      l.wallet_id     AS wallet_id,
      l.amount        AS amount
    FROM public.tournament_locks l
    WHERE l.tournament_id = p_tournament_id
      AND l.lock_kind = 'entry'
      AND l.status = 'held'
    FOR UPDATE SKIP LOCKED
  LOOP
    v_idem := 'under_min_cancel_refund:' || r.lock_id::text;

    IF r.wallet_id IS NOT NULL THEN
      SELECT w.id, w.currency
        INTO v_wallet_id, v_wallet_currency
      FROM public.wallets w
      WHERE w.id = r.wallet_id
      FOR UPDATE;
    ELSE
      SELECT w.id, w.currency
        INTO v_wallet_id, v_wallet_currency
      FROM public.wallets w
      WHERE w.user_id = r.user_id
      ORDER BY w.created_at
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF v_wallet_id IS NULL THEN
      RAISE EXCEPTION 'wallet not found for user % (lock %)', r.user_id, r.lock_id;
    END IF;

    IF coalesce(r.amount, 0) > 0 THEN
      SELECT game_finance.fn_wallet_apply_delta(
        p_user_id          := r.user_id,
        p_currency         := v_wallet_currency,
        p_amount_delta     := r.amount,
        p_transaction_type := 'join_refund',
        p_source_kind      := 'tournament_join',
        p_source_ref       := p_tournament_id::text,
        p_description      := 'refund after tournament cancelled (under min players)',
        p_meta             := jsonb_build_object(
                                'tournament_id', p_tournament_id,
                                'entry_id', r.entry_id,
                                'lock_id', r.lock_id,
                                'reason', 'under_min_players',
                                'idempotency_key', v_idem
                              ),
        p_allow_negative   := false,
        p_idempotency_key  := v_idem
      ) INTO v_tx;

      UPDATE public.wallets w
         SET locked_amount = w.locked_amount - r.amount,
             updated_at = now()
       WHERE w.id = v_wallet_id
         AND w.locked_amount >= r.amount;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'insufficient locked_amount for wallet % (need %, lock %)',
          v_wallet_id, r.amount, r.lock_id;
      END IF;
    END IF;

    UPDATE public.tournament_locks
       SET status = 'released',
           released_at = coalesce(released_at, now()),
           updated_at = now(),
           idempotency_key = v_idem,
           meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object(
                   'under_min_refund_tx', v_tx,
                   'under_min_refunded_at', now()
                 )
     WHERE id = r.lock_id;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.tournament_entries e
     SET status = 'cancelled'::public.tournament_entry_status
   WHERE e.tournament_id = p_tournament_id
     AND e.status = 'created'::public.tournament_entry_status;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION tournament.fn_cancel_under_min_players(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament.fn_cancel_under_min_players(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION tournament.fn_cancel_under_min_players(uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.fn_cancel_under_min_players(
  p_tournament_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $$
BEGIN
  RETURN tournament.fn_cancel_under_min_players(p_tournament_id);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_cancel_under_min_players(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cancel_under_min_players(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_cancel_under_min_players(uuid) TO postgres;

CREATE OR REPLACE FUNCTION tournament.fn_tick_due_tournaments(
  p_limit integer DEFAULT 50,
  p_seed bigint DEFAULT NULL::bigint,
  p_batch_tables integer DEFAULT NULL::integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  r record;
  v_count int := 0;
  v_entries_players int;
  v_min_players int;
  v_extend_minutes int;
  v_extend_enabled boolean;

  v_ctx    text;
  v_detail text;
  v_hint   text;
BEGIN
  FOR r IN
    SELECT
      t.id,
      t.status,
      GREATEST(COALESCE(NULLIF(t.meta->>'min_players_to_start','')::int, 3), 3) AS min_players_to_start,
      LEAST(
        GREATEST(COALESCE(NULLIF(t.meta->>'registration_extend_minutes','')::int, 60), 1),
        10080
      ) AS registration_extend_minutes,
      tournament.fn_jsonb_bool(t.meta, 'registration_extend_enabled', true) AS registration_extend_enabled
    FROM public.tournaments t
    WHERE
      (t.status = 'registration_open'::public.tournament_status
       AND t.start_at IS NOT NULL
       AND t.start_at <= now())
      OR
      (t.status = 'running'::public.tournament_status)
    ORDER BY t.start_at NULLS LAST, t.created_at
    LIMIT p_limit
  LOOP
    BEGIN
      IF r.status = 'registration_open'::public.tournament_status THEN
        v_min_players := COALESCE(r.min_players_to_start, 3);
        v_extend_minutes := COALESCE(r.registration_extend_minutes, 60);
        v_extend_enabled := COALESCE(r.registration_extend_enabled, true);

        SELECT count(DISTINCT te.user_id)
          INTO v_entries_players
        FROM public.tournament_entries te
        WHERE te.tournament_id = r.id
          AND te.status = 'created';

        IF COALESCE(v_entries_players, 0) < v_min_players THEN
          IF v_extend_enabled THEN
            UPDATE public.tournaments
               SET start_at = now() + make_interval(mins => v_extend_minutes),
                   updated_at = now()
             WHERE id = r.id
               AND status = 'registration_open'::public.tournament_status;
          ELSE
            PERFORM tournament.fn_cancel_under_min_players(r.id);
            INSERT INTO tournament.tournament_tick_log(tournament_id, stage, sqlstate, message, context)
            VALUES (
              r.id,
              'cancel_under_min',
              NULL,
              format('players=%s min=%s', COALESCE(v_entries_players, 0), v_min_players),
              NULL
            );
          END IF;
          CONTINUE;
        END IF;
      END IF;

      PERFORM tournament.fn_tick_tournament(
        p_tournament_id := r.id,
        p_seed          := p_seed::bigint,
        p_batch_tables  := CASE
                             WHEN p_batch_tables IS NULL THEN NULL::integer[]
                             ELSE ARRAY[p_batch_tables::integer]
                           END
      );

      v_count := v_count + 1;

    EXCEPTION
      WHEN lock_not_available THEN
        CONTINUE;

      WHEN others THEN
        GET STACKED DIAGNOSTICS
          v_ctx    = PG_EXCEPTION_CONTEXT,
          v_detail = PG_EXCEPTION_DETAIL,
          v_hint   = PG_EXCEPTION_HINT;

        INSERT INTO tournament.tournament_tick_log(tournament_id, stage, sqlstate, message, context)
        VALUES (
          r.id,
          'fn_tick_tournament',
          SQLSTATE,
          SQLERRM
            || COALESCE(' | detail=' || v_detail, '')
            || COALESCE(' | hint='   || v_hint, ''),
          v_ctx
        );

        CONTINUE;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_admin_create_tournament(p_payload jsonb)
 RETURNS public.tournaments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_now           timestamptz := now();
  v_row           public.tournaments%rowtype;
  v_status        public.tournament_status := coalesce(
                         nullif(p_payload->>'status','')::public.tournament_status,
                         'draft'::public.tournament_status
                       );
  v_final_winners int := nullif(p_payload->>'final_winners_count','')::int;
  v_min_players_to_start int := nullif(p_payload->>'min_players_to_start','')::int;
  v_registration_extend_minutes int := nullif(p_payload->>'registration_extend_minutes','')::int;
  v_registration_extend_enabled boolean;
  v_entry_currency text := upper(coalesce(nullif(p_payload->>'entry_currency',''), p_payload->>'currency', 'IRR'));
  v_guaranteed numeric := nullif(p_payload->>'guaranteed_prize','')::numeric;
  v_meta jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF v_status NOT IN ('draft','registration_open') THEN
    RAISE EXCEPTION 'invalid initial status';
  END IF;

  IF v_final_winners IS NOT NULL AND (v_final_winners < 1 OR v_final_winners > 4) THEN
    RAISE EXCEPTION 'final_winners_count must be between 1 and 4';
  END IF;

  IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
    RAISE EXCEPTION 'min_players_to_start must be >= 3';
  END IF;

  IF v_registration_extend_minutes IS NOT NULL
     AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
    RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
  END IF;

  v_registration_extend_enabled := tournament.fn_jsonb_bool(
    p_payload, 'registration_extend_enabled', true
  );

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  IF v_entry_currency = 'DING' AND (v_guaranteed IS NULL OR v_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'final_winners_count', v_final_winners,
    'min_players_to_start', coalesce(v_min_players_to_start, 3),
    'registration_extend_minutes', coalesce(v_registration_extend_minutes, 60),
    'registration_extend_enabled', v_registration_extend_enabled,
    'entry_currency', v_entry_currency
  ));

  INSERT INTO public.tournaments(
    title, status, start_at, currency, ticket_price,
    min_tickets_per_player, max_tickets_per_player,
    table_size_mode, table_size_fixed, table_size_min, table_size_max,
    remainder_policy, commission_rate, guaranteed_prize, meta, created_at, updated_at
  )
  VALUES (
    p_payload->>'title',
    v_status,
    nullif(p_payload->>'start_at','')::timestamptz,
    coalesce(p_payload->>'currency','IRR'),
    nullif(p_payload->>'ticket_price','')::numeric,
    nullif(p_payload->>'min_tickets_per_player','')::int,
    nullif(p_payload->>'max_tickets_per_player','')::int,
    coalesce(nullif(p_payload->>'table_size_mode','')::public.tournament_table_size_mode, 'fixed'),
    nullif(p_payload->>'table_size_fixed','')::int,
    nullif(p_payload->>'table_size_min','')::int,
    nullif(p_payload->>'table_size_max','')::int,
    coalesce(nullif(p_payload->>'remainder_policy','')::public.tournament_remainder_policy, 'adaptive_tables'),
    nullif(p_payload->>'commission_rate','')::numeric,
    v_guaranteed,
    CASE WHEN v_meta = '{}'::jsonb THEN NULL ELSE v_meta END,
    v_now,
    v_now
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_admin_update_tournament(p_tournament_id uuid, p_patch jsonb)
 RETURNS public.tournaments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor         uuid := auth.uid();
  v_actor_role    public.user_role;
  v_actor_status  public.user_status;
  v_row           public.tournaments%rowtype;
  v_now           timestamptz := now();
  v_allowed_keys  text[] := array[
    'title','start_at','currency','ticket_price','min_tickets_per_player',
    'max_tickets_per_player','table_size_mode','table_size_fixed','table_size_min',
    'table_size_max','remainder_policy','guaranteed_prize','commission_rate','meta'
  ];
  v_bad_keys      text[];
  v_min_players_to_start int;
  v_registration_extend_minutes int;
  v_entry_currency text;
  v_next_guaranteed numeric;
  v_next_meta jsonb;
BEGIN
  p_patch := coalesce(p_patch, '{}'::jsonb);

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT role, status
    INTO v_actor_role, v_actor_status
  FROM public.users
  WHERE id = v_actor;

  IF v_actor_role NOT IN ('admin','super') OR v_actor_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF p_tournament_id IS NULL THEN
    RAISE EXCEPTION 'tournament_id is required';
  END IF;

  SELECT * INTO v_row FROM public.tournaments WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament_not_found';
  END IF;

  IF v_row.status IN ('running','settling','finished') THEN
    RAISE EXCEPTION 'tournament is locked';
  END IF;

  v_bad_keys := (
    SELECT array_agg(k)
    FROM jsonb_object_keys(p_patch) AS k
    WHERE k <> ALL (v_allowed_keys)
  );
  IF v_bad_keys IS NOT NULL THEN
    RAISE EXCEPTION 'unsupported keys: %', v_bad_keys;
  END IF;

  IF p_patch ? 'status' THEN
    RAISE EXCEPTION 'status cannot be changed via this RPC';
  END IF;

  IF p_patch ? 'meta' THEN
    v_min_players_to_start := nullif(p_patch->'meta'->>'min_players_to_start','')::int;
    IF v_min_players_to_start IS NOT NULL AND v_min_players_to_start < 3 THEN
      RAISE EXCEPTION 'min_players_to_start must be >= 3';
    END IF;

    v_registration_extend_minutes := nullif(p_patch->'meta'->>'registration_extend_minutes','')::int;
    IF v_registration_extend_minutes IS NOT NULL
       AND (v_registration_extend_minutes < 1 OR v_registration_extend_minutes > 10080) THEN
      RAISE EXCEPTION 'registration_extend_minutes must be between 1 and 10080';
    END IF;
  END IF;

  v_entry_currency := upper(coalesce(
    nullif(p_patch->'meta'->>'entry_currency',''),
    v_row.meta->>'entry_currency',
    v_row.currency,
    'IRR'
  ));

  IF v_entry_currency NOT IN ('IRR','DING') THEN
    RAISE EXCEPTION 'entry_currency must be IRR or DING';
  END IF;

  v_next_guaranteed := coalesce(nullif(p_patch->>'guaranteed_prize','')::numeric, v_row.guaranteed_prize);
  IF v_entry_currency = 'DING' AND (v_next_guaranteed IS NULL OR v_next_guaranteed <= 0) THEN
    RAISE EXCEPTION 'ding tournaments require guaranteed_prize';
  END IF;

  IF p_patch ? 'meta' THEN
    v_next_meta := (coalesce(v_row.meta, '{}'::jsonb) || coalesce(p_patch->'meta','{}'::jsonb))
                   - 'min_players_for_guarantee';
  ELSE
    v_next_meta := v_row.meta;
  END IF;

  UPDATE public.tournaments t
     SET title                   = coalesce(p_patch->>'title', t.title),
         start_at                = coalesce((p_patch->>'start_at')::timestamptz, t.start_at),
         currency                = coalesce(p_patch->>'currency', t.currency),
         ticket_price            = coalesce(nullif(p_patch->>'ticket_price','')::numeric, t.ticket_price),
         min_tickets_per_player  = coalesce(nullif(p_patch->>'min_tickets_per_player','')::int, t.min_tickets_per_player),
         max_tickets_per_player  = coalesce(nullif(p_patch->>'max_tickets_per_player','')::int, t.max_tickets_per_player),
         table_size_mode         = coalesce(
                                    nullif(p_patch->>'table_size_mode','')::public.tournament_table_size_mode,
                                    t.table_size_mode
                                  ),
         table_size_fixed        = coalesce(nullif(p_patch->>'table_size_fixed','')::int, t.table_size_fixed),
         table_size_min          = coalesce(nullif(p_patch->>'table_size_min','')::int, t.table_size_min),
         table_size_max          = coalesce(nullif(p_patch->>'table_size_max','')::int, t.table_size_max),
         remainder_policy        = coalesce(
                                    nullif(p_patch->>'remainder_policy','')::public.tournament_remainder_policy,
                                    t.remainder_policy
                                  ),
         commission_rate         = coalesce(nullif(p_patch->>'commission_rate','')::numeric, t.commission_rate),
         guaranteed_prize        = v_next_guaranteed,
         meta                    = v_next_meta,
         updated_at              = v_now
   WHERE t.id = p_tournament_id
   RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION tournament.fn_payout_tournament(p_tournament_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'tournament', 'public', 'pg_temp'
AS $function$
DECLARE
  v_t               public.tournaments%rowtype;
  v_pool            numeric := 0;
  v_entries_total   numeric := 0;
  v_pool_from_comm  numeric := 0;
  v_pool_base       numeric := 0;
  v_last_round      int;
  v_rules_count     int;
  v_winners_count   int;
  v_currency        text;
  v_now             timestamptz := now();
  v_effective_guarantee numeric := 0;
  v_entry_currency text;

  r_winner record;
  r_rule   record;
  r_pay    record;
  v_amount numeric;
BEGIN
  SELECT * INTO v_t
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'tournament not found: %', p_tournament_id;
  END IF;

  v_currency := COALESCE(v_t.currency, 'IRR');
  v_entry_currency := upper(coalesce(nullif(v_t.meta->>'entry_currency',''), v_t.currency, 'IRR'));

  SELECT COALESCE(sum(amount), 0)
    INTO v_entries_total
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id
    AND status IN ('created', 'settled');

  -- Start already gated min_players_to_start; if the tournament ran, guarantee applies.
  v_effective_guarantee := COALESCE(v_t.guaranteed_prize, 0);

  SELECT COALESCE(sum(amount_to_pool), 0)
    INTO v_pool_from_comm
  FROM public.tournament_commission_snapshots
  WHERE tournament_id = p_tournament_id;

  IF v_entry_currency = 'DING' THEN
    v_entries_total := 0;
    v_pool_from_comm := 0;
  END IF;

  v_pool_base := COALESCE(NULLIF(v_pool_from_comm, 0), v_entries_total);
  v_pool := GREATEST(COALESCE(v_effective_guarantee, 0), v_pool_base);

  SELECT COALESCE(max(round_no), 0)
    INTO v_last_round
  FROM public.tournament_round_rooms
  WHERE tournament_id = p_tournament_id;

  IF v_last_round = 0 THEN
    RAISE EXCEPTION 'no rounds found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_winners_count
  FROM (
    SELECT rw.user_id
    FROM public.tournament_round_rooms trr
    JOIN public.room_winners rw ON rw.room_id = trr.room_id
    WHERE trr.tournament_id = p_tournament_id
      AND trr.round_no = v_last_round
    GROUP BY rw.user_id
  ) w;

  IF v_winners_count = 0 THEN
    RAISE EXCEPTION 'no winners found for tournament %', p_tournament_id;
  END IF;

  SELECT count(*) INTO v_rules_count
  FROM public.tournament_prize_rules
  WHERE tournament_id = p_tournament_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.tournament_payouts WHERE tournament_id = p_tournament_id
  ) THEN
    IF v_rules_count = 0 THEN
      INSERT INTO public.tournament_payouts(
        tournament_id, user_id, rank, amount, status, created_at
      )
      SELECT p_tournament_id, w.user_id, 1, v_pool, 'pending', v_now
      FROM (
        SELECT rw.user_id, sum(rw.weight) as score
        FROM public.tournament_round_rooms trr
        JOIN public.room_winners rw ON rw.room_id = trr.room_id
        WHERE trr.tournament_id = p_tournament_id
          AND trr.round_no = v_last_round
        GROUP BY rw.user_id
        ORDER BY score desc, rw.user_id
        LIMIT 1
      ) w;
    ELSE
      FOR r_rule IN
        SELECT rank, payout_type, payout_value
        FROM public.tournament_prize_rules
        WHERE tournament_id = p_tournament_id
        ORDER BY rank
      LOOP
        FOR r_winner IN
          SELECT user_id
          FROM (
            SELECT rw.user_id, sum(rw.weight) as score
            FROM public.tournament_round_rooms trr
            JOIN public.room_winners rw ON rw.room_id = trr.room_id
            WHERE trr.tournament_id = p_tournament_id
              AND trr.round_no = v_last_round
            GROUP BY rw.user_id
          ) s
          ORDER BY score desc, user_id
          OFFSET (r_rule.rank - 1)
          LIMIT 1
        LOOP
          IF r_rule.payout_type = 'percent' THEN
            v_amount := v_pool * CASE
              WHEN r_rule.payout_value > 1 THEN r_rule.payout_value / 100
              ELSE r_rule.payout_value
            END;
          ELSE
            v_amount := r_rule.payout_value;
          END IF;

          INSERT INTO public.tournament_payouts(
            tournament_id, user_id, rank, amount, status, created_at
          ) VALUES (
            p_tournament_id, r_winner.user_id, r_rule.rank, v_amount, 'pending', v_now
          )
          ON CONFLICT DO NOTHING;
        END LOOP;
      END LOOP;
    END IF;
  END IF;

  FOR r_pay IN
    SELECT id, user_id, amount
    FROM public.tournament_payouts
    WHERE tournament_id = p_tournament_id
      AND status = 'pending'
    FOR UPDATE
  LOOP
    PERFORM game_finance.fn_wallet_apply_delta(
      p_user_id := r_pay.user_id,
      p_currency := v_currency,
      p_amount_delta := r_pay.amount,
      p_transaction_type := 'win',
      p_source_kind := 'tournament_prize',
      p_source_ref := p_tournament_id::text,
      p_description := 'tournament prize payout',
      p_meta := jsonb_build_object('tournament_id', p_tournament_id, 'payout_id', r_pay.id),
      p_allow_negative := false
    );

    UPDATE public.tournament_payouts
       SET status = 'paid',
           paid_at = v_now
     WHERE id = r_pay.id;
  END LOOP;

  RETURN;
END;
$function$;

COMMIT;
