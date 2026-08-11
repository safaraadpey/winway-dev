begin;

-- Crypto withdrawal approve: capture player hold + credit approving admin wallet.
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

commit;
