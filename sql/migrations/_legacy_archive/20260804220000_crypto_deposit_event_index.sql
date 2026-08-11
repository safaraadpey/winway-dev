-- Multi-event safe crypto deposits: UNIQUE(network, tx_hash, event_index)
-- Replaces UNIQUE(tx_hash) which dropped secondary Transfer events in one tx.
--
-- UP: add event_index (default 0 for legacy/native), swap unique constraint
-- DOWN: restore UNIQUE(tx_hash) only when no multi-event rows exist

BEGIN;

ALTER TABLE deposit.crypto_transactions
  ADD COLUMN IF NOT EXISTS event_index integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN deposit.crypto_transactions.event_index IS
  'On-chain event identity within tx: TRON event_index / BEP20 logIndex; native transfers use 0';

-- Backfill (idempotent for existing rows before NOT NULL DEFAULT applied)
UPDATE deposit.crypto_transactions
SET event_index = 0
WHERE event_index IS NULL;

ALTER TABLE deposit.crypto_transactions
  DROP CONSTRAINT IF EXISTS crypto_transactions_tx_hash_unique;

ALTER TABLE deposit.crypto_transactions
  DROP CONSTRAINT IF EXISTS crypto_transactions_network_tx_event_unique;

ALTER TABLE deposit.crypto_transactions
  ADD CONSTRAINT crypto_transactions_network_tx_event_unique
  UNIQUE (network, tx_hash, event_index);

COMMIT;

-- ---------------------------------------------------------------------------
-- DOWN (manual / reverse migration companion):
-- BEGIN;
-- -- Fails if any tx_hash has more than one event_index (expected after multi-event credits)
-- ALTER TABLE deposit.crypto_transactions
--   DROP CONSTRAINT IF EXISTS crypto_transactions_network_tx_event_unique;
-- ALTER TABLE deposit.crypto_transactions
--   ADD CONSTRAINT crypto_transactions_tx_hash_unique UNIQUE (tx_hash);
-- ALTER TABLE deposit.crypto_transactions DROP COLUMN IF EXISTS event_index;
-- COMMIT;
