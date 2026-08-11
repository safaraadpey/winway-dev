-- Crypto deposit invoice engine — admin tiered multipliers + bonus
-- Used by POST /api/deposit/calculate-invoice and admin crypto payment panel.

BEGIN;

CREATE TABLE IF NOT EXISTS deposit.crypto_rate_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL
    CHECK (network IN ('BEP20', 'TRC20', 'TRX')),
  min_usd numeric(18, 6) NOT NULL
    CHECK (min_usd >= 0),
  max_usd numeric(18, 6) NOT NULL
    CHECK (max_usd > min_usd),
  multiplier numeric(12, 6) NOT NULL
    CHECK (multiplier > 0 AND multiplier <= 10),
  bonus_percent numeric(8, 4) NOT NULL DEFAULT 0
    CHECK (bonus_percent >= 0 AND bonus_percent <= 100),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE deposit.crypto_rate_tiers IS
  'Admin tiered multipliers / bonuses for crypto deposit invoice (BEP20, TRC20, TRX)';

CREATE INDEX IF NOT EXISTS crypto_rate_tiers_network_active_idx
  ON deposit.crypto_rate_tiers (network, is_active, min_usd);

CREATE OR REPLACE FUNCTION deposit.tg_crypto_rate_tiers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crypto_rate_tiers_updated_at ON deposit.crypto_rate_tiers;
CREATE TRIGGER trg_crypto_rate_tiers_updated_at
  BEFORE UPDATE ON deposit.crypto_rate_tiers
  FOR EACH ROW
  EXECUTE FUNCTION deposit.tg_crypto_rate_tiers_updated_at();

-- Seed defaults only when empty
INSERT INTO deposit.crypto_rate_tiers (
  network, min_usd, max_usd, multiplier, bonus_percent, sort_order
)
SELECT * FROM (VALUES
  ('BEP20'::text, 0::numeric, 50::numeric, 1.00::numeric, 0::numeric, 10),
  ('BEP20', 50, 1000, 0.99, 0, 20),
  ('TRC20', 0, 20, 1.08, 0, 30),
  ('TRC20', 20, 100, 1.05, 0, 40),
  ('TRC20', 100, 1000, 1.03, 0, 50),
  ('TRX', 0, 1000, 1.01, 0, 60)
) AS v(network, min_usd, max_usd, multiplier, bonus_percent, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM deposit.crypto_rate_tiers LIMIT 1);

ALTER TABLE deposit.crypto_rate_tiers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE deposit.crypto_rate_tiers FROM PUBLIC;
REVOKE ALL ON TABLE deposit.crypto_rate_tiers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.crypto_rate_tiers TO postgres, service_role;

COMMIT;
