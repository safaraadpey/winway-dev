begin;

-- Crypto withdrawals: admin-only review again.
-- Rial withdrawals stay assigned-agent-only via fn_withdrawal_actor_can_review.

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

-- Drop 2-arg overload added for agent-only crypto (if present).
drop function if exists public.fn_withdrawal_actor_can_review_crypto(uuid, uuid);

create or replace function public.fn_withdrawal_request_mark_processing(
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

  if v_req.status = 'processing' then
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

  update public.withdrawal_requests
     set status = 'processing',
         updated_at = now()
   where id = v_req.id;

  return query
    select v_req.id, 'processing'::public.withdrawal_request_status, false;
end;
$$;

create or replace function public.fn_withdrawal_request_approve_crypto(
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

  if v_req.kind <> 'crypto' then
    raise exception 'invalid_kind';
  end if;

  if v_req.status = 'approved' then
    return query select v_req.id, v_req.status, true;
    return;
  end if;

  if v_req.status not in ('pending', 'processing') then
    raise exception 'invalid_status';
  end if;

  if not public.fn_withdrawal_actor_can_review_crypto(p_actor_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform public.fn_withdrawal_capture(v_req.player_id, v_req.amount, v_req.id);

  -- Credit approving admin wallet.
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
                          'kind', 'crypto',
                          'review_note', nullif(btrim(coalesce(p_reason, '')), '')
                        ),
    p_allow_negative  := false,
    p_idempotency_key := 'withdrawal_crypto_approve_credit:' || v_req.id::text
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
  v_note text;
begin
  if p_request_id is null or p_actor_id is null then
    raise exception 'request_id and actor_id required';
  end if;

  v_note := nullif(btrim(coalesce(p_reason, '')), '');

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

  if v_req.status not in ('pending', 'processing') then
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
         reject_reason = v_note,
         review_note = v_note,
         updated_at = now()
   where id = v_req.id;

  return query
    select v_req.id, 'rejected'::public.withdrawal_request_status, false;
end;
$$;

commit;
