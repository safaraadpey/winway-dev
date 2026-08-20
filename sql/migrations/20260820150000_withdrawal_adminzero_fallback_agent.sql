begin;

-- Players without an assigned agent/super upstream are handled by adminzero.
-- adminzero may list/review rial withdrawals when resolved as the assigned agent.

create or replace function public.fn_resolve_player_agent_id(p_player_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_aff_agent_id uuid;
  v_aff_super_id uuid;
  v_parent_id uuid;
  v_parent_role public.users.role%type;
  v_adminzero_id uuid;
begin
  if p_player_id is null then
    return null;
  end if;

  select pa.agent_id, pa.super_id
    into v_aff_agent_id, v_aff_super_id
  from public.player_affiliation pa
  where pa.user_id = p_player_id
  limit 1;

  if v_aff_agent_id is not null then
    return v_aff_agent_id;
  end if;

  select u.parent_id, p.role
    into v_parent_id, v_parent_role
  from public.users u
  left join public.users p on p.id = u.parent_id
  where u.id = p_player_id
    and u.role = 'player'
  limit 1;

  if v_parent_role = 'agent' then
    return v_parent_id;
  end if;

  if v_aff_super_id is not null or v_parent_role = 'super' then
    return v_parent_id;
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  if v_adminzero_id is not null then
    return v_adminzero_id;
  end if;

  if v_parent_role = 'admin' then
    return v_parent_id;
  end if;

  return v_parent_id;
end;
$$;

create or replace function public.fn_withdrawal_actor_can_review(
  p_actor_id uuid,
  p_player_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_role public.users.role%type;
  v_assigned_agent_id uuid;
begin
  if p_actor_id is null or p_player_id is null then
    return false;
  end if;

  v_assigned_agent_id := public.fn_resolve_player_agent_id(p_player_id);
  if v_assigned_agent_id is null or v_assigned_agent_id <> p_actor_id then
    return false;
  end if;

  select u.role
    into v_actor_role
  from public.users u
  where u.id = p_actor_id;

  return v_actor_role in ('agent', 'admin');
end;
$$;

-- Align stored agent_id with resolver for open rial requests.
update public.withdrawal_requests wr
   set agent_id = public.fn_resolve_player_agent_id(wr.player_id),
       updated_at = now()
 where wr.status in ('pending', 'processing')
   and coalesce(wr.kind, 'rial') = 'rial'
   and public.fn_resolve_player_agent_id(wr.player_id) is not null
   and wr.agent_id is distinct from public.fn_resolve_player_agent_id(wr.player_id);

commit;
