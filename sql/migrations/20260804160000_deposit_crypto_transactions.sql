-- Crypto deposit monitoring engine — transactions ledger
BEGIN;

DO $$ BEGIN
  CREATE TYPE deposit.crypto_tx_network AS ENUM ('BEP20', 'TRC20');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE deposit.crypto_tx_status AS ENUM (
    'PENDING', 'CONFIRMED', 'FAILED', 'SWEPT'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS deposit.crypto_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  network deposit.crypto_tx_network NOT NULL,
  currency text NOT NULL,
  tx_hash text NOT NULL,
  from_address text,
  to_address text NOT NULL,
  crypto_amount numeric(36, 18) NOT NULL CHECK (crypto_amount > 0),
  toman_amount numeric(18, 2) NOT NULL CHECK (toman_amount >= 0),
  status deposit.crypto_tx_status NOT NULL DEFAULT 'PENDING',
  confirmations integer,
  price_source text,
  price_lock_used boolean NOT NULL DEFAULT false,
  wallet_tx_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crypto_transactions_tx_hash_unique UNIQUE (tx_hash),
  CONSTRAINT crypto_transactions_currency_check
    CHECK (currency IN ('USDT', 'BNB', 'TRX', 'TRC10'))
);

COMMENT ON TABLE deposit.crypto_transactions IS
  'Observed on-chain crypto deposits (BEP20/TRC20); wallet credit only after CONFIRMED';

CREATE INDEX IF NOT EXISTS crypto_transactions_user_id_idx
  ON deposit.crypto_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS crypto_transactions_status_idx
  ON deposit.crypto_transactions (status)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS crypto_transactions_to_address_idx
  ON deposit.crypto_transactions (to_address);

CREATE OR REPLACE FUNCTION deposit.tg_crypto_transactions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crypto_transactions_updated_at
  ON deposit.crypto_transactions;
CREATE TRIGGER trg_crypto_transactions_updated_at
  BEFORE UPDATE ON deposit.crypto_transactions
  FOR EACH ROW
  EXECUTE FUNCTION deposit.tg_crypto_transactions_updated_at();

ALTER TABLE deposit.crypto_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE deposit.crypto_transactions FROM PUBLIC;
REVOKE ALL ON TABLE deposit.crypto_transactions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE deposit.crypto_transactions
  TO postgres, service_role;

COMMIT;
