-- Migration: fix player_affiliation constraint and seed relationships
-- Date: 2025-12-02

BEGIN;

ALTER TABLE public.player_affiliation
  DROP CONSTRAINT IF EXISTS chk_affiliation_loop;

ALTER TABLE public.player_affiliation
  ADD CONSTRAINT chk_affiliation_loop CHECK (
    (agent_id IS NULL OR user_id <> agent_id)
    AND (super_id IS NULL OR user_id <> super_id)
    AND (agent_id IS NULL OR super_id IS NULL OR agent_id <> super_id)
  );

INSERT INTO public.player_affiliation (user_id, agent_id, super_id, created_at)
VALUES
  ('1af870cf-dbe5-4ddb-ab87-6d03567c376f', '16b02e40-412c-4164-8413-a9967f437fc5', 'e485be44-702b-421c-9f6c-28a353900394', now()),
  ('926787de-2e07-4d61-9d7d-8c068f60a6b0', NULL,                               'e485be44-702b-421c-9f6c-28a353900394', now()),
  ('b95db096-cbec-4fe2-8d8f-ed3f7e9d2a9c', 'a239db1f-d903-49d8-9f8c-04ba019ffc4c', 'e485be44-702b-421c-9f6c-28a353900394', now()),
  ('8d9b17e1-d410-4e11-babf-bfeb1a65c8ea', '7b4f927d-6615-4185-86c8-e60ba10a7a92', NULL,                               now())
ON CONFLICT (user_id)
DO UPDATE SET agent_id = EXCLUDED.agent_id, super_id = EXCLUDED.super_id;

COMMIT;


