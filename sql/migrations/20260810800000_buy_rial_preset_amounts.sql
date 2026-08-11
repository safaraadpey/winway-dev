-- Buy Rial preset amounts (admin-editable list for player amount picker)

BEGIN;

CREATE TABLE IF NOT EXISTS deposit.buy_rial_preset_amounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_rial bigint NOT NULL
    CHECK (amount_rial > 0 AND amount_rial <= 100000000000),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE deposit.buy_rial_preset_amounts IS
  'Admin-editable preset Rial amounts for Buy Rial player picker';

CREATE UNIQUE INDEX IF NOT EXISTS buy_rial_preset_amounts_amount_uidx
  ON deposit.buy_rial_preset_amounts (amount_rial);

CREATE INDEX IF NOT EXISTS buy_rial_preset_amounts_active_sort_idx
  ON deposit.buy_rial_preset_amounts (is_active, sort_order, amount_rial);

CREATE OR REPLACE FUNCTION deposit.tg_buy_rial_preset_amounts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_buy_rial_preset_amounts_updated_at
  ON deposit.buy_rial_preset_amounts;
CREATE TRIGGER trg_buy_rial_preset_amounts_updated_at
  BEFORE UPDATE ON deposit.buy_rial_preset_amounts
  FOR EACH ROW
  EXECUTE FUNCTION deposit.tg_buy_rial_preset_amounts_updated_at();

-- Seed current hardcoded defaults only when empty
INSERT INTO deposit.buy_rial_preset_amounts (amount_rial, sort_order, is_active)
SELECT * FROM (VALUES
  (530000::bigint, 10, true),
  (870000, 20, true),
  (1030000, 30, true),
  (1780000, 40, true),
  (2550000, 50, true),
  (4320000, 60, true),
  (5630000, 70, true),
  (7240000, 80, true),
  (10450000, 90, true),
  (15560000, 100, true)
) AS v(amount_rial, sort_order, is_active)
WHERE NOT EXISTS (SELECT 1 FROM deposit.buy_rial_preset_amounts LIMIT 1);

ALTER TABLE deposit.buy_rial_preset_amounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE deposit.buy_rial_preset_amounts FROM PUBLIC;
REVOKE ALL ON TABLE deposit.buy_rial_preset_amounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.buy_rial_preset_amounts
  TO postgres, service_role;

COMMIT;
