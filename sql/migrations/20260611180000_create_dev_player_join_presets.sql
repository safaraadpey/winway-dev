-- Named join-behavior presets (Dev Panel → Settings → رفتار Join)
BEGIN;

CREATE TABLE IF NOT EXISTS public.dev_player_join_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_room_limit_enabled_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  min_wallet_balance numeric NOT NULL DEFAULT 0,
  exclude_vip boolean NOT NULL DEFAULT true,
  exclude_tournament boolean NOT NULL DEFAULT true,
  auto_approve_schedules boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_player_join_presets_name_check CHECK (length(trim(name)) > 0),
  CONSTRAINT dev_player_join_presets_min_wallet_balance_check
    CHECK (min_wallet_balance >= 0)
);

COMMENT ON TABLE public.dev_player_join_presets IS
  'Named presets for Dev Player join behavior (template limits, wallet gate, filters).';

CREATE TABLE IF NOT EXISTS public.dev_player_join_preset_template_limits (
  preset_id uuid NOT NULL REFERENCES public.dev_player_join_presets(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.room_templates(id) ON DELETE CASCADE,
  min_active_rooms integer,
  max_active_rooms integer,
  join_interval_minutes integer,
  max_joins_per_tick integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (preset_id, template_id),
  CONSTRAINT dev_player_join_preset_template_limits_min_check
    CHECK (min_active_rooms IS NULL OR min_active_rooms >= 0),
  CONSTRAINT dev_player_join_preset_template_limits_max_check
    CHECK (max_active_rooms IS NULL OR max_active_rooms >= 0),
  CONSTRAINT dev_player_join_preset_template_limits_range_check
    CHECK (
      min_active_rooms IS NULL
      OR max_active_rooms IS NULL
      OR min_active_rooms <= max_active_rooms
    ),
  CONSTRAINT dev_player_join_preset_template_limits_join_interval_check
    CHECK (join_interval_minutes IS NULL OR (join_interval_minutes >= 1 AND join_interval_minutes <= 120)),
  CONSTRAINT dev_player_join_preset_template_limits_max_joins_check
    CHECK (max_joins_per_tick IS NULL OR (max_joins_per_tick >= 1 AND max_joins_per_tick <= 100)),
  CONSTRAINT dev_player_join_preset_template_limits_has_value_check
    CHECK (
      min_active_rooms IS NOT NULL
      OR max_active_rooms IS NOT NULL
      OR join_interval_minutes IS NOT NULL
      OR max_joins_per_tick IS NOT NULL
    )
);

COMMENT ON TABLE public.dev_player_join_preset_template_limits IS
  'Per-template limits stored inside a join preset.';

ALTER TABLE public.dev_player_settings
  ADD COLUMN IF NOT EXISTS active_join_preset_id uuid
    REFERENCES public.dev_player_join_presets(id) ON DELETE SET NULL;

ALTER TABLE public.dev_player_join_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_player_join_preset_template_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_dev_player_join_presets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_player_join_presets_updated_at ON public.dev_player_join_presets;
CREATE TRIGGER trg_dev_player_join_presets_updated_at
  BEFORE UPDATE ON public.dev_player_join_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dev_player_join_presets_updated_at();

CREATE OR REPLACE FUNCTION public.update_dev_player_join_preset_template_limits_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_player_join_preset_template_limits_updated_at
  ON public.dev_player_join_preset_template_limits;
CREATE TRIGGER trg_dev_player_join_preset_template_limits_updated_at
  BEFORE UPDATE ON public.dev_player_join_preset_template_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dev_player_join_preset_template_limits_updated_at();

-- Migrate existing global join settings into a default preset (once).
DO $$
DECLARE
  v_preset_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dev_player_join_presets) THEN
    INSERT INTO public.dev_player_join_presets (
      name,
      template_room_limit_enabled_ids,
      min_wallet_balance,
      exclude_vip,
      exclude_tournament,
      auto_approve_schedules
    )
    SELECT
      'پیش‌فرض',
      COALESCE(s.template_room_limit_enabled_ids, '{}'::uuid[]),
      COALESCE(s.min_wallet_balance, 0),
      COALESCE(s.exclude_vip, true),
      COALESCE(s.exclude_tournament, true),
      COALESCE(s.auto_approve_schedules, true)
    FROM public.dev_player_settings s
    WHERE s.id = true
    RETURNING id INTO v_preset_id;

    INSERT INTO public.dev_player_join_preset_template_limits (
      preset_id,
      template_id,
      min_active_rooms,
      max_active_rooms,
      join_interval_minutes,
      max_joins_per_tick
    )
    SELECT
      v_preset_id,
      l.template_id,
      l.min_active_rooms,
      l.max_active_rooms,
      l.join_interval_minutes,
      l.max_joins_per_tick
    FROM public.dev_player_template_room_limits l;

    UPDATE public.dev_player_settings
    SET active_join_preset_id = v_preset_id
    WHERE id = true AND active_join_preset_id IS NULL;
  END IF;
END $$;

COMMIT;
