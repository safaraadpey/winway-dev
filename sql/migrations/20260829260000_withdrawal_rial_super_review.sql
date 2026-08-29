begin;

-- Assigned super (players whose resolved agent_id is the super) may review rial withdrawals.
-- Crypto review stays admin-only.

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
  v_adminzero_id uuid;
begin
  if p_actor_id is null or p_player_id is null then
    return false;
  end if;

  v_assigned_agent_id := public.fn_resolve_player_agent_id(p_player_id);
  if v_assigned_agent_id is null then
    return false;
  end if;

  select u.role
    into v_actor_role
  from public.users u
  where u.id = p_actor_id;

  if v_actor_role not in ('agent', 'admin', 'super') then
    return false;
  end if;

  if v_assigned_agent_id = p_actor_id then
    return true;
  end if;

  v_adminzero_id := public.fn_adminzero_user_id();
  if v_adminzero_id is not null
     and v_assigned_agent_id = v_adminzero_id
     and public.fn_is_manager_admin(p_actor_id) then
    return true;
  end if;

  return false;
end;
$$;

commit;
