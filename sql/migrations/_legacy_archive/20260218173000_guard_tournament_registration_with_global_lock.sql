-- Guard tournament registration with global registration lock.
-- This keeps tournament join flow aligned with normal game join lock behavior.

DO $$
DECLARE
  v_def text;
  v_new_def text;
BEGIN
  SELECT pg_get_functiondef(
           'public.fn_tournament_wallet_hold(uuid, integer, text, uuid)'::regprocedure
         )
    INTO v_def;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'function public.fn_tournament_wallet_hold(uuid, integer, text, uuid) not found';
  END IF;

  -- Already patched in this environment.
  IF position('global registration locked' in v_def) > 0 THEN
    RETURN;
  END IF;

  v_new_def := regexp_replace(
    v_def,
    'IF v_user IS NULL THEN\s*RAISE EXCEPTION ''unauthenticated'';\s*END IF;',
    E'IF v_user IS NULL THEN\n    RAISE EXCEPTION ''unauthenticated'';\n  END IF;\n\n  IF EXISTS (\n    SELECT 1\n    FROM public.app_runtime_flags arf\n    WHERE arf.id = true\n      AND COALESCE(arf.global_registration_locked, false)\n  ) THEN\n    RAISE EXCEPTION ''global registration locked'';\n  END IF;',
    'g'
  );

  IF v_new_def = v_def THEN
    RAISE EXCEPTION 'failed to patch fn_tournament_wallet_hold: auth block pattern not found';
  END IF;

  EXECUTE v_new_def;
END
$$;

