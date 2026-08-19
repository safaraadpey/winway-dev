-- Feature flags infrastructure (generic feature management layer)

BEGIN;

CREATE TABLE IF NOT EXISTS public.features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL
    CHECK (key ~ '^[a-z0-9][a-z0-9_]*[a-z0-9]$'),
  name text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  default_enabled boolean NOT NULL DEFAULT false,
  rollout_percentage smallint NOT NULL DEFAULT 0
    CHECK (rollout_percentage BETWEEN 0 AND 100),
  rollout_salt text NOT NULL DEFAULT gen_random_uuid()::text,
  expires_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.features IS
  'Feature flag definitions; evaluated by fn_has_feature / fn_user_features';

CREATE UNIQUE INDEX IF NOT EXISTS features_key_uidx
  ON public.features (key);

CREATE INDEX IF NOT EXISTS features_enabled_idx
  ON public.features (is_enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.feature_user_overrides (
  feature_id uuid NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  note text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feature_id, user_id)
);

COMMENT ON TABLE public.feature_user_overrides IS
  'Per-user feature overrides; upsert on (feature_id, user_id) for idempotent assignment';

CREATE INDEX IF NOT EXISTS feature_user_overrides_user_id_idx
  ON public.feature_user_overrides (user_id);

CREATE OR REPLACE FUNCTION public.tg_features_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_features_updated_at ON public.features;
CREATE TRIGGER trg_features_updated_at
  BEFORE UPDATE ON public.features
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_features_updated_at();

CREATE OR REPLACE FUNCTION public.tg_feature_user_overrides_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_feature_user_overrides_updated_at ON public.feature_user_overrides;
CREATE TRIGGER trg_feature_user_overrides_updated_at
  BEFORE UPDATE ON public.feature_user_overrides
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_feature_user_overrides_updated_at();

-- Deterministic rollout bucket: stable per (feature key, salt, user_id).
CREATE OR REPLACE FUNCTION public.fn_feature_rollout_bucket(
  p_key text,
  p_rollout_salt text,
  p_user_id uuid
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT mod(
    abs(
      ('x' || substr(md5(p_key || ':' || p_rollout_salt || ':' || p_user_id::text), 1, 8))::bit(32)::bigint
    ),
    100
  );
$$;

-- Core evaluation for one feature row + optional override.
-- Precedence: master kill switch -> feature expiry -> user override -> default_enabled -> rollout bucket.
-- Future: insert cohort stage between override and default_enabled.
CREATE OR REPLACE FUNCTION public.fn_feature_eval_enabled(
  p_user_id uuid,
  p_is_enabled boolean,
  p_default_enabled boolean,
  p_rollout_percentage smallint,
  p_feature_key text,
  p_rollout_salt text,
  p_feature_expires_at timestamptz,
  p_override_is_enabled boolean,
  p_override_expires_at timestamptz,
  p_has_override boolean
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT COALESCE(p_is_enabled, false) THEN
    RETURN false;
  END IF;

  IF p_feature_expires_at IS NOT NULL AND p_feature_expires_at <= now() THEN
    RETURN false;
  END IF;

  IF COALESCE(p_has_override, false) THEN
    IF p_override_expires_at IS NOT NULL AND p_override_expires_at <= now() THEN
      NULL;
    ELSE
      RETURN COALESCE(p_override_is_enabled, false);
    END IF;
  END IF;

  -- Future cohort/group stage goes here.

  IF COALESCE(p_default_enabled, false) THEN
    RETURN true;
  END IF;

  IF COALESCE(p_rollout_percentage, 0) <= 0 THEN
    RETURN false;
  END IF;

  IF COALESCE(p_rollout_percentage, 0) >= 100 THEN
    RETURN true;
  END IF;

  RETURN public.fn_feature_rollout_bucket(p_feature_key, p_rollout_salt, p_user_id)
    < p_rollout_percentage;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_has_feature(
  p_user_id uuid,
  p_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_feature public.features%ROWTYPE;
  v_override public.feature_user_overrides%ROWTYPE;
  v_has_override boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_key IS NULL OR btrim(p_key) = '' THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_feature
  FROM public.features f
  WHERE f.key = p_key
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_override
  FROM public.feature_user_overrides o
  WHERE o.feature_id = v_feature.id
    AND o.user_id = p_user_id
  LIMIT 1;

  v_has_override := FOUND;

  RETURN public.fn_feature_eval_enabled(
    p_user_id,
    v_feature.is_enabled,
    v_feature.default_enabled,
    v_feature.rollout_percentage,
    v_feature.key,
    v_feature.rollout_salt,
    v_feature.expires_at,
    v_override.is_enabled,
    v_override.expires_at,
    v_has_override
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_user_features(
  p_user_id uuid
)
RETURNS SETOF text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT f.key
  FROM public.features f
  LEFT JOIN public.feature_user_overrides o
    ON o.feature_id = f.id
   AND o.user_id = p_user_id
  WHERE public.fn_feature_eval_enabled(
    p_user_id,
    f.is_enabled,
    f.default_enabled,
    f.rollout_percentage,
    f.key,
    f.rollout_salt,
    f.expires_at,
    o.is_enabled,
    o.expires_at,
    o.feature_id IS NOT NULL
  );
END;
$$;

INSERT INTO public.features (key, name, description, is_enabled, default_enabled)
VALUES (
  'sample_beta_badge',
  'Sample Beta Badge',
  'End-to-end sample feature for infrastructure testing',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_user_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.features FROM PUBLIC;
REVOKE ALL ON TABLE public.features FROM anon, authenticated;
REVOKE ALL ON TABLE public.feature_user_overrides FROM PUBLIC;
REVOKE ALL ON TABLE public.feature_user_overrides FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.features
  TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.feature_user_overrides
  TO postgres, service_role;

REVOKE ALL ON FUNCTION public.fn_feature_rollout_bucket(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_feature_eval_enabled(uuid, boolean, boolean, smallint, text, text, timestamptz, boolean, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_has_feature(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_user_features(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_feature_rollout_bucket(text, text, uuid) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_feature_eval_enabled(uuid, boolean, boolean, smallint, text, text, timestamptz, boolean, timestamptz, boolean) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_has_feature(uuid, text) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.fn_user_features(uuid) TO postgres, service_role;

COMMIT;
