-- Global Dev Player settings (singleton row, managed from Dev Panel → Settings)
BEGIN;

CREATE TABLE IF NOT EXISTS public.dev_player_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  system_enabled boolean NOT NULL DEFAULT false,
  scheduler_enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Asia/Tehran',
  default_play_windows jsonb NOT NULL DEFAULT '[{"start":"10:00","end":"22:00"}]'::jsonb,
  default_min_room_price numeric,
  default_max_room_price numeric,
  default_max_ticket_count integer NOT NULL DEFAULT 2,
  join_interval_minutes integer NOT NULL DEFAULT 5,
  max_joins_per_tick integer NOT NULL DEFAULT 10,
  min_wallet_balance numeric NOT NULL DEFAULT 0,
  template_selection_mode text NOT NULL DEFAULT 'any_in_price_range',
  template_whitelist_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  exclude_vip boolean NOT NULL DEFAULT true,
  exclude_tournament boolean NOT NULL DEFAULT true,
  auto_approve_schedules boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dev_player_settings_singleton CHECK (id = true),
  CONSTRAINT dev_player_settings_default_max_ticket_count_check
    CHECK (default_max_ticket_count > 0 AND default_max_ticket_count <= 50),
  CONSTRAINT dev_player_settings_join_interval_check
    CHECK (join_interval_minutes >= 1 AND join_interval_minutes <= 120),
  CONSTRAINT dev_player_settings_max_joins_per_tick_check
    CHECK (max_joins_per_tick >= 1 AND max_joins_per_tick <= 100),
  CONSTRAINT dev_player_settings_min_wallet_balance_check
    CHECK (min_wallet_balance >= 0),
  CONSTRAINT dev_player_settings_default_price_range_check
    CHECK (
      default_min_room_price IS NULL
      OR default_max_room_price IS NULL
      OR default_min_room_price <= default_max_room_price
    ),
  CONSTRAINT dev_player_settings_template_selection_mode_check
    CHECK (
      template_selection_mode IN (
        'any_in_price_range',
        'cheapest',
        'random',
        'whitelist'
      )
    )
);

COMMENT ON TABLE public.dev_player_settings IS
  'Singleton global settings for Dev Player automation (Dev Panel → Settings).';

INSERT INTO public.dev_player_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.dev_player_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_dev_player_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dev_player_settings_updated_at ON public.dev_player_settings;
CREATE TRIGGER trg_dev_player_settings_updated_at
  BEFORE UPDATE ON public.dev_player_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dev_player_settings_updated_at();

COMMIT;
