-- Crypto deposit address infrastructure — XPUB settings + per-user derived addresses
BEGIN;

-- Singleton XPUB configuration (Super Admin only via API)
CREATE TABLE IF NOT EXISTS deposit.crypto_xpub_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  bep20_xpub text,
  trc20_xpub text,
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crypto_xpub_settings_singleton CHECK (id = true)
);

COMMENT ON TABLE deposit.crypto_xpub_settings IS
  'Master XPUB keys for BEP-20 (BSC) and TRC-20 (Tron) HD address derivation';

INSERT INTO deposit.crypto_xpub_settings (id, bep20_xpub, trc20_xpub)
VALUES (
  true,
  'xpub6DRw6FHgizQYYpYyy23tZi2TF7ViG12rfACUtnJ9UJANymQAJu65a2miSJpesCZNEUYC6vaWn7Lkb5P5fmCyBipYZRomPj1irVcyu4tZ2tB',
  'xpub6CoumTrwJ5xzfPLZCMPNTxCmWo6soGPoiGeFAWxidBjnBdnvQ9ghVXvAp4XkZvHDKNTvGADpHPWa9rGNvnaGn8PjC2e8fWBrjshrJxk4cFX'
)
ON CONFLICT (id) DO NOTHING;

-- Thread-safe derivation counter (incremented under advisory lock in allocator)
CREATE TABLE IF NOT EXISTS deposit.crypto_derivation_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  last_derivation_index integer NOT NULL DEFAULT -1
    CHECK (last_derivation_index >= -1),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crypto_derivation_state_singleton CHECK (id = true)
);

INSERT INTO deposit.crypto_derivation_state (id, last_derivation_index)
VALUES (true, -1)
ON CONFLICT (id) DO NOTHING;

-- Per-user derived deposit addresses
CREATE TABLE IF NOT EXISTS deposit.user_crypto_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  derivation_index integer NOT NULL UNIQUE,
  bep20_address text NOT NULL UNIQUE,
  trc20_address text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE deposit.user_crypto_addresses IS
  'User-specific BEP-20 / TRC-20 deposit addresses derived from admin XPUB keys';

CREATE INDEX IF NOT EXISTS user_crypto_addresses_user_id_idx
  ON deposit.user_crypto_addresses (user_id);

CREATE OR REPLACE FUNCTION deposit.tg_crypto_xpub_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crypto_xpub_settings_updated_at ON deposit.crypto_xpub_settings;
CREATE TRIGGER trg_crypto_xpub_settings_updated_at
  BEFORE UPDATE ON deposit.crypto_xpub_settings
  FOR EACH ROW
  EXECUTE FUNCTION deposit.tg_crypto_xpub_settings_updated_at();

ALTER TABLE deposit.crypto_xpub_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.crypto_derivation_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.user_crypto_addresses ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE deposit.crypto_xpub_settings FROM PUBLIC;
REVOKE ALL ON TABLE deposit.crypto_derivation_state FROM PUBLIC;
REVOKE ALL ON TABLE deposit.user_crypto_addresses FROM PUBLIC;
REVOKE ALL ON TABLE deposit.crypto_xpub_settings FROM anon, authenticated;
REVOKE ALL ON TABLE deposit.crypto_derivation_state FROM anon, authenticated;
REVOKE ALL ON TABLE deposit.user_crypto_addresses FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.crypto_xpub_settings TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.crypto_derivation_state TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.user_crypto_addresses TO postgres, service_role;

COMMIT;
