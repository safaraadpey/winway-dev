-- Fix: player_affiliation not being populated on signup
-- Date: 2025-12-18
--
-- Root cause:
-- - Trigger `trg_validate_affiliation_roles` uses game_core.fn_validate_affiliation_roles()
-- - That function referenced `users` without schema qualification.
--   In some execution contexts (auth trigger), it could resolve to `auth.users`,
--   causing role checks to fail and silently skipping affiliation insert (because
--   handle_new_user() swallows errors with RAISE WARNING).
--
-- This migration:
-- 1) Removes the constraint that forced (agent_id OR super_id) to be non-null,
--    to allow admin referrals (both NULL) while still validating roles when provided.
-- 2) Replaces the validation trigger function to always reference `public.users`.

begin;

-- 1) Allow admin referrals (agent_id/super_id can be both NULL)
alter table public.player_affiliation
  drop constraint if exists chk_affiliation_must_have_one;

-- 2) Fix schema resolution in validation trigger + align with allowed admin referrals
create or replace function game_core.fn_validate_affiliation_roles()
returns trigger
language plpgsql
security definer
as $$
declare
  r_user  text;
  r_agent text;
  r_super text;
begin
  -- user_id must be a player (use public.users explicitly)
  select role::text into r_user from public.users where id = new.user_id;
  if r_user is distinct from 'player' then
    raise exception 'user_id must have role=player (now=%)', r_user;
  end if;

  -- if agent_id provided, it must be role=agent
  if new.agent_id is not null then
    select role::text into r_agent from public.users where id = new.agent_id;
    if r_agent is distinct from 'agent' then
      raise exception 'agent_id must have role=agent (now=%)', r_agent;
    end if;
  end if;

  -- if super_id provided, it must be role=super
  if new.super_id is not null then
    select role::text into r_super from public.users where id = new.super_id;
    if r_super is distinct from 'super' then
      raise exception 'super_id must have role=super (now=%)', r_super;
    end if;
  end if;

  return new;
end;
$$;

commit;


