-- Admin-configurable confirmation thresholds for crypto deposits
BEGIN;

ALTER TABLE deposit.crypto_xpub_settings
  ADD COLUMN IF NOT EXISTS bep20_confirmations integer NOT NULL DEFAULT 12
    CHECK (bep20_confirmations >= 1 AND bep20_confirmations <= 256);

ALTER TABLE deposit.crypto_xpub_settings
  ADD COLUMN IF NOT EXISTS tron_confirmations integer NOT NULL DEFAULT 1
    CHECK (tron_confirmations >= 1 AND tron_confirmations <= 256);

COMMENT ON COLUMN deposit.crypto_xpub_settings.bep20_confirmations IS
  'Min BSC confirmations before crypto deposit is CONFIRMED (default 12)';
COMMENT ON COLUMN deposit.crypto_xpub_settings.tron_confirmations IS
  'Min Tron confirmations before crypto deposit is CONFIRMED (default 1)';

COMMIT;
