begin;

-- Extend withdrawal_requests for crypto payouts (admin-reviewed).
alter table public.withdrawal_requests
  add column if not exists kind text not null default 'rial'
    check (kind in ('rial', 'crypto'));

alter table public.withdrawal_requests
  add column if not exists network text,
  add column if not exists crypto_symbol text,
  add column if not exists crypto_amount numeric,
  add column if not exists wallet_address text,
  add column if not exists requested_toman bigint;

alter table public.withdrawal_requests
  alter column card_number drop not null,
  alter column full_name drop not null,
  alter column agent_id drop not null;

create index if not exists withdrawal_requests_kind_status_idx
  on public.withdrawal_requests (kind, status, created_at desc);

create or replace function public.fn_withdrawal_actor_can_review_crypto(
  p_actor_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_role public.users.role%type;
begin
  if p_actor_id is null then
    return false;
  end if;

  select u.role into v_actor_role from public.users u where u.id = p_actor_id;
  return v_actor_role = 'admin';
end;
$$;

create or replace function public.fn_withdrawal_request_create_crypto(
  p_player_id uuid,
  p_locked_toman bigint,
  p_requested_toman bigint,
  p_network text,
  p_crypto_symbol text,
  p_crypto_amount numeric,
  p_wallet_address text,
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
  v_request_id uuid;
  v_existing public.withdrawal_requests%rowtype;
  v_address text;
  v_network text;
  v_symbol text;
begin
  if p_player_id is null then
    raise exception 'player_id required';
  end if;

  if p_locked_toman is null or p_locked_toman <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if nullif(btrim(p_client_request_id), '') is null then
    raise exception 'client_request_id required';
  end if;

  v_network := upper(btrim(coalesce(p_network, '')));
  if v_network not in ('BEP20', 'TRC20', 'TRX') then
    raise exception 'invalid_network';
  end if;

  v_symbol := upper(btrim(coalesce(p_crypto_symbol, '')));
  if v_symbol not in ('USDT', 'TRX') then
    raise exception 'invalid_crypto_symbol';
  end if;

  if p_crypto_amount is null or p_crypto_amount <= 0 then
    raise exception 'invalid_crypto_amount';
  end if;

  v_address := btrim(coalesce(p_wallet_address, ''));
  if length(v_address) < 10 then
    raise exception 'invalid_wallet_address';
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

  v_request_id := gen_random_uuid();

  perform public.fn_withdrawal_hold(p_player_id, p_locked_toman, v_request_id);

  insert into public.withdrawal_requests (
    id,
    player_id,
    agent_id,
    amount,
    currency,
    card_number,
    full_name,
    status,
    client_request_id,
    kind,
    network,
    crypto_symbol,
    crypto_amount,
    wallet_address,
    requested_toman
  ) values (
    v_request_id,
    p_player_id,
    null,
    p_locked_toman,
    'IRR',
    null,
    null,
    'pending',
    p_client_request_id,
    'crypto',
    v_network,
    v_symbol,
    p_crypto_amount,
    v_address,
    p_requested_toman
  );

  return query
    select v_request_id, 'pending'::public.withdrawal_request_status, false;
end;
$$;

create or replace function public.fn_withdrawal_request_approve_crypto(
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

  if v_req.kind <> 'crypto' then
    raise exception 'invalid_kind';
  end if;

  if v_req.status = 'approved' then
    return query select v_req.id, v_req.status, true;
    return;
  end if;

  if v_req.status <> 'pending' then
    raise exception 'invalid_status';
  end if;

  if not public.fn_withdrawal_actor_can_review_crypto(p_actor_id) then
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
    p_description     := 'crypto withdrawal request approved',
    p_meta            := jsonb_build_object(
                          'withdrawal_request_id', v_req.id,
                          'player_id', v_req.player_id,
                          'actor_id', p_actor_id,
                          'kind', 'crypto'
                        ),
    p_allow_negative  := false,
    p_idempotency_key := 'withdrawal_crypto_approve_credit:' || v_req.id::text
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

-- Rial create: set kind explicitly
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
    client_request_id,
    kind
  ) values (
    v_request_id,
    p_player_id,
    v_agent_id,
    p_amount,
    'IRR',
    v_card,
    v_name,
    'pending',
    p_client_request_id,
    'rial'
  );

  return query
    select v_request_id, 'pending'::public.withdrawal_request_status, false;
end;
$$;

-- Rial approve: only rial kind
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

  if coalesce(v_req.kind, 'rial') <> 'rial' then
    raise exception 'invalid_kind';
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

-- Reject: kind-aware review gate
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

  if coalesce(v_req.kind, 'rial') = 'crypto' then
    if not public.fn_withdrawal_actor_can_review_crypto(p_actor_id) then
      raise exception 'FORBIDDEN';
    end if;
  elsif not public.fn_withdrawal_actor_can_review(p_actor_id, v_req.player_id) then
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

revoke all on function public.fn_withdrawal_actor_can_review_crypto(uuid) from public;
revoke all on function public.fn_withdrawal_request_create_crypto(uuid, bigint, bigint, text, text, numeric, text, text) from public;
revoke all on function public.fn_withdrawal_request_approve_crypto(uuid, uuid) from public;

grant execute on function public.fn_withdrawal_request_create_crypto(uuid, bigint, bigint, text, text, numeric, text, text) to service_role;
grant execute on function public.fn_withdrawal_request_approve_crypto(uuid, uuid) to service_role;

commit;
