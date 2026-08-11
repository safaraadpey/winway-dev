-- Keep player_affiliation synchronized with users.parent_id hierarchy.
-- This migration:
-- 1) Backfills current mismatches.
-- 2) Adds trigger-based sync for future signup/parent changes.

begin;

create or replace function game_core.fn_sync_player_affiliation_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_role text;
  v_parent_id uuid;
  v_parent_role text;
  v_parent_parent_id uuid;
  v_super_role text;
  v_expected_agent_id uuid;
  v_expected_super_id uuid;
begin
  select u.role::text, u.parent_id
    into v_user_role, v_parent_id
  from public.users u
  where u.id = p_user_id;

  -- If user not found or not a player, remove any stale row.
  if not found or v_user_role is distinct from 'player' then
    delete from public.player_affiliation pa
    where pa.user_id = p_user_id;
    return;
  end if;

  -- Player with no parent has no affiliation row.
  if v_parent_id is null then
    delete from public.player_affiliation pa
    where pa.user_id = p_user_id;
    return;
  end if;

  select p.role::text, p.parent_id
    into v_parent_role, v_parent_parent_id
  from public.users p
  where p.id = v_parent_id;

  v_expected_agent_id := null;
  v_expected_super_id := null;

  if v_parent_role = 'agent' then
    v_expected_agent_id := v_parent_id;
    if v_parent_parent_id is not null then
      select s.role::text
        into v_super_role
      from public.users s
      where s.id = v_parent_parent_id;

      if v_super_role = 'super' then
        v_expected_super_id := v_parent_parent_id;
      end if;
    end if;
  elsif v_parent_role = 'super' then
    v_expected_super_id := v_parent_id;
  end if;

  -- Parent is neither agent nor super -> no affiliation row.
  if v_expected_agent_id is null and v_expected_super_id is null then
    delete from public.player_affiliation pa
    where pa.user_id = p_user_id;
    return;
  end if;

  insert into public.player_affiliation (user_id, agent_id, super_id)
  values (p_user_id, v_expected_agent_id, v_expected_super_id)
  on conflict (user_id) do update
    set agent_id = excluded.agent_id,
        super_id = excluded.super_id;
end;
$$;

create or replace function game_core.fn_trg_sync_player_affiliation_from_users()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  -- Always sync the changed user (covers player insert/update and role changes).
  perform game_core.fn_sync_player_affiliation_for_user(new.id);

  -- If an agent changed role/parent, players under that agent may need super_id refresh.
  if (new.role::text = 'agent' or (tg_op = 'UPDATE' and old.role::text = 'agent')) then
    for r in
      select p.id
      from public.users p
      where p.role = 'player'
        and p.parent_id = new.id
    loop
      perform game_core.fn_sync_player_affiliation_for_user(r.id);
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_player_affiliation_from_users on public.users;
create trigger trg_sync_player_affiliation_from_users
after insert or update of role, parent_id
on public.users
for each row
execute function game_core.fn_trg_sync_player_affiliation_from_users();

-- One-time backfill based on current users.parent_id chain:
with expected as (
  select
    p.id as user_id,
    case when parent.role = 'agent' then parent.id else null end as expected_agent_id,
    case
      when parent.role = 'agent' and sparent.role = 'super' then sparent.id
      when parent.role = 'super' then parent.id
      else null
    end as expected_super_id
  from public.users p
  left join public.users parent on parent.id = p.parent_id
  left join public.users sparent on sparent.id = parent.parent_id
  where p.role = 'player'
)
insert into public.player_affiliation (user_id, agent_id, super_id)
select e.user_id, e.expected_agent_id, e.expected_super_id
from expected e
where e.expected_agent_id is not null
   or e.expected_super_id is not null
on conflict (user_id) do update
  set agent_id = excluded.agent_id,
      super_id = excluded.super_id;

-- Cleanup stale rows:
-- - non-player user_id rows
-- - player rows that should have no affiliation under current parent chain
with expected as (
  select
    p.id as user_id,
    case when parent.role = 'agent' then parent.id else null end as expected_agent_id,
    case
      when parent.role = 'agent' and sparent.role = 'super' then sparent.id
      when parent.role = 'super' then parent.id
      else null
    end as expected_super_id
  from public.users p
  left join public.users parent on parent.id = p.parent_id
  left join public.users sparent on sparent.id = parent.parent_id
  where p.role = 'player'
)
delete from public.player_affiliation pa
where exists (
  select 1
  from public.users u
  where u.id = pa.user_id
    and u.role <> 'player'
)
or exists (
  select 1
  from expected e
  where e.user_id = pa.user_id
    and e.expected_agent_id is null
    and e.expected_super_id is null
);

commit;

