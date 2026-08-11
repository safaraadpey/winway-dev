begin;

-- Player-initiated rial withdrawal requests with balance hold / agent review.
create type public.withdrawal_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.users(id) on delete restrict,
  agent_id uuid not null references public.users(id) on delete restrict,
  amount bigint not null check (amount > 0),
  currency text not null default 'IRR',
  card_number text not null,
  full_name text not null,
  status public.withdrawal_request_status not null default 'pending',
  client_request_id text not null,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint withdrawal_requests_client_request_id_uniq unique (player_id, client_request_id)
);

create index if not exists withdrawal_requests_agent_status_idx
  on public.withdrawal_requests (agent_id, status, created_at desc);

create index if not exists withdrawal_requests_player_created_idx
  on public.withdrawal_requests (player_id, created_at desc);

create or replace function public.fn_resolve_player_agent_id(p_player_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent_id uuid;
begin
  select pa.agent_id
    into v_agent_id
  from public.player_affiliation pa
  where pa.user_id = p_player_id
  limit 1;

  if v_agent_id is not null then
    return v_agent_id;
  end if;

  select u.parent_id
    into v_agent_id
  from public.users u
  where u.id = p_player_id
    and u.role = 'player'
  limit 1;

  return v_agent_id;
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
  v_player_role public.users.role%type;
begin
  if p_actor_id is null or p_player_id is null then
    return false;
  end if;

  select u.role into v_actor_role from public.users u where u.id = p_actor_id;
  select u.role into v_player_role from public.users u where u.id = p_player_id;

  if v_actor_role is null or v_player_role is null then
    return false;
  end if;

  if v_actor_role = 'admin' then
    return true;
  end if;

  if v_player_role <> 'player' then
    return false;
  end if;

  if v_actor_role = 'super' then
    return exists (
      select 1
      from public.player_affiliation pa
      where pa.user_id = p_player_id
        and pa.super_id = p_actor_id
    )
    or exists (
      select 1
      from public.users p
      where p.id = p_player_id
        and p.role = 'player'
        and p.parent_id = p_actor_id
    )
    or exists (
      select 1
      from public.users p
      join public.users a on a.id = p.parent_id
      where p.id = p_player_id
        and p.role = 'player'
        and a.parent_id = p_actor_id
        and a.role = 'agent'
    );
  end if;

  if v_actor_role = 'agent' then
    return exists (
      select 1
      from public.player_affiliation pa
      where pa.user_id = p_player_id
        and pa.agent_id = p_actor_id
    )
    or exists (
      select 1
      from public.users p
      where p.id = p_player_id
        and p.role = 'player'
        and p.parent_id = p_actor_id
    );
  end if;

  return false;
end;
$$;

create or replace function public.fn_withdrawal_hold(
  p_user_id uuid,
  p_amount bigint,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, game_finance
as $$
declare
  v_wallet_id uuid;
  v_free numeric;
  v_tx uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id, balance
    into v_wallet_id, v_free
  from public.wallets
  where user_id = p_user_id
    and currency = 'IRR'
  for update;

  if v_wallet_id is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if v_free < p_amount then
    raise exception 'insufficient_funds';
  end if;

  select game_finance.fn_wallet_apply_delta(
           p_user_id         := p_user_id,
           p_currency        := 'IRR',
           p_amount_delta    := -p_amount,
           p_transaction_type:= 'join_hold',
           p_source_kind     := 'withdrawal_request',
           p_source_ref      := p_request_id::text,
           p_description     := 'hold for withdrawal request',
           p_meta            := jsonb_build_object('withdrawal_request_id', p_request_id),
           p_allow_negative  := false,
           p_idempotency_key := 'withdrawal_hold:' || p_request_id::text
         )
    into v_tx;

  update public.wallets
     set locked_amount = locked_amount + p_amount,
         updated_at    = now()
   where id = v_wallet_id;

  return v_tx;
end;
$$;

create or replace function public.fn_withdrawal_release(
  p_user_id uuid,
  p_amount bigint,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, game_finance
as $$
declare
  v_wallet_id uuid;
  v_locked numeric;
  v_tx uuid;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id, locked_amount
    into v_wallet_id, v_locked
  from public.wallets
  where user_id = p_user_id
    and currency = 'IRR'
  for update;

  if v_wallet_id is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if v_locked < p_amount then
    raise exception 'insufficient locked amount';
  end if;

  select game_finance.fn_wallet_apply_delta(
           p_user_id         := p_user_id,
           p_currency        := 'IRR',
           p_amount_delta    := p_amount,
           p_transaction_type:= 'join_refund',
           p_source_kind     := 'withdrawal_request',
           p_source_ref      := p_request_id::text,
           p_description     := 'release withdrawal hold',
           p_meta            := jsonb_build_object('withdrawal_request_id', p_request_id),
           p_allow_negative  := false,
           p_idempotency_key := 'withdrawal_release:' || p_request_id::text
         )
    into v_tx;

  update public.wallets
     set locked_amount = locked_amount - p_amount,
         updated_at    = now()
   where id = v_wallet_id;

  return v_tx;
end;
$$;

create or replace function public.fn_withdrawal_capture(
  p_user_id uuid,
  p_amount bigint,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, game_finance
as $$
declare
  v_wallet_id uuid;
  v_locked numeric;
begin
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select id, locked_amount
    into v_wallet_id, v_locked
  from public.wallets
  where user_id = p_user_id
    and currency = 'IRR'
  for update;

  if v_wallet_id is null then
    raise exception 'wallet not found for user %', p_user_id;
  end if;

  if v_locked < p_amount then
    raise exception 'insufficient locked amount for capture';
  end if;

  update public.wallets
     set locked_amount = locked_amount - p_amount,
         updated_at    = now()
   where id = v_wallet_id;
end;
$$;

create or replace function public.fn_withdrawal_request_create(
  p_player_id uuid,
  p_amount bigint,
  p_card_number text,
  p_full_name text,
  p_client_request_id text
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
  v_agent_id uuid;
  v_request_id uuid;
  v_existing public.withdrawal_requests%rowtype;
  v_card text;
  v_name text;
begin
  if p_player_id is null then
    raise exception 'player_id required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if nullif(btrim(p_client_request_id), '') is null then
    raise exception 'client_request_id required';
  end if;

  v_card := regexp_replace(coalesce(p_card_number, ''), '\D', '', 'g');
  if length(v_card) < 16 or length(v_card) > 19 then
    raise exception 'invalid_card_number';
  end if;

  v_name := btrim(coalesce(p_full_name, ''));
  if length(v_name) < 3 or length(v_name) > 120 then
    raise exception 'invalid_full_name';
  end if;

  select wr.*
    into v_existing
  from public.withdrawal_requests wr
  where wr.player_id = p_player_id
    and wr.client_request_id = p_client_request_id
  limit 1;

  if found then
    return query
      select v_existing.id, v_existing.status, true;
    return;
  end if;

  v_agent_id := public.fn_resolve_player_agent_id(p_player_id);
  if v_agent_id is null then
    raise exception 'no_agent_assigned';
  end if;

  v_request_id := gen_random_uuid();

  perform public.fn_withdrawal_hold(p_player_id, p_amount, v_request_id);

  insert into public.withdrawal_requests (
    id,
    player_id,
    agent_id,
    amount,
    currency,
    card_number,
    full_name,
    status,
    client_request_id
  ) values (
    v_request_id,
    p_player_id,
    v_agent_id,
    p_amount,
    'IRR',
    v_card,
    v_name,
    'pending',
    p_client_request_id
  );

  return query
    select v_request_id, 'pending'::public.withdrawal_request_status, false;
end;
$$;

create or replace function public.fn_withdrawal_request_approve(
  p_request_id uuid,
  p_actor_id uuid
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

  if v_req.status = 'approved' then
    return query select v_req.id, v_req.status, true;
    return;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'invalid_status';
  end if;

  if not public.fn_withdrawal_actor_can_review(p_actor_id, v_req.player_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.fn_withdrawal_capture(v_req.player_id, v_req.amount, v_req.id);

  perform game_finance.fn_wallet_apply_delta(
    p_user_id         := v_req.agent_id,
    p_currency        := 'IRR',
    p_amount_delta    := v_req.amount,
    p_transaction_type:= 'transfer_in',
    p_source_kind     := 'withdrawal_request',
    p_source_ref      := v_req.id::text,
    p_description     := 'withdrawal request approved',
    p_meta            := jsonb_build_object(
                          'withdrawal_request_id', v_req.id,
                          'player_id', v_req.player_id,
                          'actor_id', p_actor_id
                        ),
    p_allow_negative  := false,
    p_idempotency_key := 'withdrawal_approve_credit:' || v_req.id::text
  );

  update public.withdrawal_requests
     set status = 'approved',
         reviewed_by = p_actor_id,
         reviewed_at = now(),
         updated_at = now()
   where id = v_req.id;

  return query
    select v_req.id, 'approved'::public.withdrawal_request_status, false;
end;
$$;

create or replace function public.fn_withdrawal_request_reject(
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

  if v_req.status = 'rejected' then
    return query select v_req.id, v_req.status, true;
    return;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'invalid_status';
  end if;

  if not public.fn_withdrawal_actor_can_review(p_actor_id, v_req.player_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.fn_withdrawal_release(v_req.player_id, v_req.amount, v_req.id);

  update public.withdrawal_requests
     set status = 'rejected',
         reviewed_by = p_actor_id,
         reviewed_at = now(),
         reject_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where id = v_req.id;

  return query
    select v_req.id, 'rejected'::public.withdrawal_request_status, false;
end;
$$;

revoke all on function public.fn_resolve_player_agent_id(uuid) from public;
revoke all on function public.fn_withdrawal_actor_can_review(uuid, uuid) from public;
revoke all on function public.fn_withdrawal_hold(uuid, bigint, uuid) from public;
revoke all on function public.fn_withdrawal_release(uuid, bigint, uuid) from public;
revoke all on function public.fn_withdrawal_capture(uuid, bigint, uuid) from public;
revoke all on function public.fn_withdrawal_request_create(uuid, bigint, text, text, text) from public;
revoke all on function public.fn_withdrawal_request_approve(uuid, uuid) from public;
revoke all on function public.fn_withdrawal_request_reject(uuid, uuid, text) from public;

grant execute on function public.fn_withdrawal_request_create(uuid, bigint, text, text, text) to service_role;
grant execute on function public.fn_withdrawal_request_approve(uuid, uuid) to service_role;
grant execute on function public.fn_withdrawal_request_reject(uuid, uuid, text) to service_role;

commit;
