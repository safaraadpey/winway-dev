-- Operator allowlist for player wallet buy / buy-rial menus.
-- Source of truth: PostgreSQL. Empty allowlist + mode=all = all players (current behavior).

BEGIN;

CREATE TABLE IF NOT EXISTS deposit.payment_menu_policy (
  menu_key text PRIMARY KEY
    CHECK (menu_key IN ('wallet_buy', 'buy_rial')),
  mode text NOT NULL DEFAULT 'all'
    CHECK (mode IN ('all', 'allowlist')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE deposit.payment_menu_policy IS
  'Visibility policy for player payment menus: all players vs selected agent/super downlines';

CREATE TABLE IF NOT EXISTS deposit.payment_menu_operators (
  menu_key text NOT NULL
    REFERENCES deposit.payment_menu_policy(menu_key) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  operator_role text NOT NULL
    CHECK (operator_role IN ('agent', 'super')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  PRIMARY KEY (menu_key, operator_id)
);

COMMENT ON TABLE deposit.payment_menu_operators IS
  'Agent/super ids whose downline players may see a payment menu when policy mode=allowlist';

CREATE INDEX IF NOT EXISTS payment_menu_operators_operator_idx
  ON deposit.payment_menu_operators (operator_id);

INSERT INTO deposit.payment_menu_policy (menu_key, mode)
VALUES ('wallet_buy', 'all'), ('buy_rial', 'all')
ON CONFLICT (menu_key) DO NOTHING;

ALTER TABLE deposit.payment_menu_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit.payment_menu_operators ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE deposit.payment_menu_policy FROM PUBLIC;
REVOKE ALL ON TABLE deposit.payment_menu_policy FROM anon, authenticated;
REVOKE ALL ON TABLE deposit.payment_menu_operators FROM PUBLIC;
REVOKE ALL ON TABLE deposit.payment_menu_operators FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.payment_menu_policy
  TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.payment_menu_operators
  TO postgres, service_role;

COMMIT;
