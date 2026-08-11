begin;

alter table public.withdrawal_requests
  add column if not exists sheba_number text;

comment on column public.withdrawal_requests.sheba_number is
  'Iranian IBAN / Sheba (IR + 24 digits) for rial withdrawals';

drop function if exists public.fn_withdrawal_request_create(uuid, bigint, text, text, text);

create or replace function public.fn_withdrawal_request_create(
  p_player_id uuid,
  p_amount bigint,
  p_card_number text,
  p_full_name text,
  p_client_request_id text,
  p_sheba_number text default null
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
  v_sheba text;
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

  v_sheba := upper(regexp_replace(coalesce(p_sheba_number, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_sheba like 'IR%' then
    v_sheba := 'IR' || regexp_replace(substr(v_sheba, 3), '\D', '', 'g');
  else
    v_sheba := 'IR' || regexp_replace(v_sheba, '\D', '', 'g');
  end if;

  if v_sheba !~ '^IR[0-9]{24}$' then
    raise exception 'invalid_sheba_number';
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
    sheba_number,
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
    v_sheba,
    'pending',
    p_client_request_id,
    'rial'
  );

  return query
    select v_request_id, 'pending'::public.withdrawal_request_status, false;
end;
$$;

revoke all on function public.fn_withdrawal_request_create(uuid, bigint, text, text, text, text) from public;
grant execute on function public.fn_withdrawal_request_create(uuid, bigint, text, text, text, text) to service_role;

commit;
