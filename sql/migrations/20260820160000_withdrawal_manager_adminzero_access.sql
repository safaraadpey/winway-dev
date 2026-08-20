begin;

-- مدیر کل (admin با sub_role خالی یا manager) می‌تواند برداشت‌های assign‌شده به adminzero را
-- ببیند، بررسی کند، و در تأیید ریالی موجودی به حساب خودش (p_actor_id) واریز شود.

create or replace function public.fn_adminzero_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;
$$;

create or replace function public.fn_is_manager_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.role = 'admin'
      and u.admin_sub_role is null
  );
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

  if v_actor_role not in ('agent', 'admin') then
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

-- Rial approve: credit acting reviewer (same as crypto), not always assigned agent.
create or replace function public.fn_withdrawal_request_approve(
  p_request_id uuid,
  p_actor_id uuid,
  p_reason text default null
)
returns table(
  request_id uuid,
  status public.withdrawal_request_status,
  replayed boolean
)
language plpgsql
security definer
set search_path = public, game_finance
as $$
declare
  v_req public.withdrawal_requests%rowtype;
begin
  if p_request_id is null or p_actor_id is null then
    raise exception 'request_id and actor_id required';
  end if;

  select *
    into v_req
  from public.withdrawal_requests wr
  where wr.id = p_request_id
  for update;

  if not found then
    raise exception 'request_not_found';
  end if;

  if coalesce(v_req.kind, 'rial') <> 'rial' then
    raise exception 'invalid_kind';
  end if;

  if v_req.status = 'approved' then
    return query select v_req.id, v_req.status, true;
    return;
  end if;

  if v_req.status not in ('pending', 'processing') then
    raise exception 'invalid_status';
  end if;

  if not public.fn_withdrawal_actor_can_review(p_actor_id, v_req.player_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.fn_withdrawal_capture(v_req.player_id, v_req.amount, v_req.id);

  perform game_finance.fn_wallet_apply_delta(
    p_user_id         := p_actor_id,
    p_currency        := 'IRR',
    p_amount_delta    := v_req.amount,
    p_transaction_type:= 'transfer_in',
    p_source_kind     := 'withdrawal_request',
    p_source_ref      := v_req.id::text,
    p_description     := 'withdrawal request approved',
    p_meta            := jsonb_build_object(
                          'withdrawal_request_id', v_req.id,
                          'player_id', v_req.player_id,
                          'assigned_agent_id', v_req.agent_id,
                          'actor_id', p_actor_id,
                          'review_note', nullif(btrim(coalesce(p_reason, '')), '')
                        ),
    p_allow_negative  := false,
    p_idempotency_key := 'withdrawal_approve_credit:' || v_req.id::text
  );

  update public.withdrawal_requests
     set status = 'approved',
         reviewed_by = p_actor_id,
         reviewed_at = now(),
         review_note = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where id = v_req.id;

  return query
    select v_req.id, 'approved'::public.withdrawal_request_status, false;
end;
$$;

commit;
