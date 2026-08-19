begin;

-- Crypto create must assign upstream agent (same as rial); never leave agent_id null.
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
  v_agent_id uuid;
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

  v_agent_id := public.fn_resolve_player_agent_id(p_player_id);
  if v_agent_id is null then
    raise exception 'no_agent_assigned';
  end if;

  select wr.*
    into v_existing
  from public.withdrawal_requests wr
  where wr.player_id = p_player_id
    and wr.client_request_id = p_client_request_id
  limit 1;

  if found then
    return query select v_existing.id, v_existing.status, true;
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
    v_agent_id,
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

-- Backfill pending/processing crypto rows missing agent assignment.
update public.withdrawal_requests wr
   set agent_id = public.fn_resolve_player_agent_id(wr.player_id),
       updated_at = now()
 where wr.kind = 'crypto'
   and wr.status in ('pending', 'processing')
   and wr.agent_id is null
   and public.fn_resolve_player_agent_id(wr.player_id) is not null;

commit;
