-- For free tournaments (ticket_price <= 0), disable min_players_for_guarantee gating.
-- Guarantee should remain payable even when player count is below meta.min_players_for_guarantee.

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(
           'tournament.fn_payout_tournament(uuid)'::regprocedure
         )
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'function tournament.fn_payout_tournament(uuid) not found';
  END IF;

  IF position('COALESCE(v_t.ticket_price, 0) > 0' in v_def) = 0 THEN
    v_def := regexp_replace(
      v_def,
      E'IF v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee > 0\n     AND v_entries_players < v_min_players_for_guarantee THEN',
      E'IF COALESCE(v_t.ticket_price, 0) > 0\n     AND v_min_players_for_guarantee IS NOT NULL AND v_min_players_for_guarantee > 0\n     AND v_entries_players < v_min_players_for_guarantee THEN',
      'g'
    );
  END IF;

  EXECUTE v_def;
END
$$;
