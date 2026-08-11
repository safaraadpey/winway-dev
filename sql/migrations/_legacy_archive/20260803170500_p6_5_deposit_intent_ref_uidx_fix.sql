-- P6.5 hotfix: allow multiple NULL provider_intent_ref
ALTER TABLE deposit.intents DROP CONSTRAINT IF EXISTS deposit_intents_provider_ref_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS deposit_intents_provider_ref_uidx
  ON deposit.intents (provider, provider_intent_ref)
  WHERE provider_intent_ref IS NOT NULL;
