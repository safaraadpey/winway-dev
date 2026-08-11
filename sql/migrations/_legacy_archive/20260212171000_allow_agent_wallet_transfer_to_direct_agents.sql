begin;

create or replace function public.fn_wallet_transfer_panel(
  p_target_id uuid,
  p_amount bigint,
  p_action text,
  p_description text default null,
  p_meta jsonb default '{}'::jsonb
)
returns table(
  transfer_id uuid,
  actor_id uuid,
  from_user_id uuid,
  to_user_id uuid
)
language plpgsql
security definer
as $$
declare
  v_actor        uuid := auth.uid();
  v_actor_role   public.users.role%type;
  v_target_role  public.users.role%type;

  v_from_user_id uuid;
  v_to_user_id   uuid;

  v_transfer_id  uuid := gen_random_uuid();

  rec record;
  v_from_wallet_id uuid;
  v_to_wallet_id   uuid;

  v_from_before bigint;
  v_to_before   bigint;
  v_from_after  bigint;
  v_to_after    bigint;

  v_desc_out text;
  v_desc_in  text;
begin
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if p_target_id is null then
    raise exception 'target_id is required';
  end if;

  if v_actor = p_target_id then
    raise exception 'cannot transfer to self';
  end if;

  select u.role into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is null then
    raise exception 'FORBIDDEN';
  end if;

  if v_actor_role not in ('admin','super','agent') then
    raise exception 'FORBIDDEN';
  end if;

  select u.role into v_target_role
  from public.users u
  where u.id = p_target_id;

  if v_target_role is null then
    raise exception 'target_not_found';
  end if;

  -- Hierarchical authorization enforced in DB
  if v_actor_role = 'admin' then
    null;
  elsif v_actor_role = 'super' then
    if v_target_role = 'agent' then
      if not exists (
        select 1
        from public.users a
        where a.id = p_target_id
          and a.role = 'agent'
          and a.parent_id = v_actor
      ) then
        raise exception 'FORBIDDEN';
      end if;
    elsif v_target_role = 'player' then
      if not exists (
        select 1
        from public.player_affiliation pa
        where pa.user_id = p_target_id
          and pa.super_id = v_actor
      )
      and not exists (
        select 1
        from public.users p
        where p.id = p_target_id
          and p.role = 'player'
          and p.parent_id = v_actor
      ) then
        raise exception 'FORBIDDEN';
      end if;
    else
      raise exception 'FORBIDDEN';
    end if;
  elsif v_actor_role = 'agent' then
    if v_target_role = 'player' then
      if not exists (
        select 1
        from public.player_affiliation pa
        where pa.user_id = p_target_id
          and pa.agent_id = v_actor
      )
      and not exists (
        select 1
        from public.users p
        where p.id = p_target_id
          and p.role = 'player'
          and p.parent_id = v_actor
      ) then
        raise exception 'FORBIDDEN';
      end if;
    elsif v_target_role = 'agent' then
      if not exists (
        select 1
        from public.users a
        where a.id = p_target_id
          and a.role = 'agent'
          and a.parent_id = v_actor
      ) then
        raise exception 'FORBIDDEN';
      end if;
    else
      raise exception 'FORBIDDEN';
    end if;
  end if;

  -- Direction mapping (UI uses deposit/withdraw, ledger uses transfer_in/transfer_out)
  if lower(p_action) = 'deposit' then
    v_from_user_id := v_actor;
    v_to_user_id := p_target_id;
  elsif lower(p_action) = 'withdraw' then
    v_from_user_id := p_target_id;
    v_to_user_id := v_actor;
  else
    raise exception 'invalid_action';
  end if;

  -- Ensure wallets exist (single row per user enforced by unique(user_id))
  insert into public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  values (v_from_user_id, 'IRR', 0, 0, now(), now())
  on conflict (user_id) do nothing;

  insert into public.wallets (user_id, currency, balance, locked_amount, created_at, updated_at)
  values (v_to_user_id, 'IRR', 0, 0, now(), now())
  on conflict (user_id) do nothing;

  -- Deterministic locking by wallet_id to avoid deadlocks
  for rec in
    select id, user_id, balance, currency
    from public.wallets
    where user_id in (v_from_user_id, v_to_user_id)
    order by id
    for update
  loop
    if rec.currency <> 'IRR' then
      raise exception 'wallet currency mismatch for user %', rec.user_id;
    end if;

    if rec.user_id = v_from_user_id then
      v_from_wallet_id := rec.id;
      v_from_before := rec.balance;
    elsif rec.user_id = v_to_user_id then
      v_to_wallet_id := rec.id;
      v_to_before := rec.balance;
    end if;
  end loop;

  if v_from_wallet_id is null or v_to_wallet_id is null then
    raise exception 'wallet_not_found';
  end if;

  v_from_after := v_from_before - p_amount;
  if v_from_after < 0 then
    raise exception 'insufficient_funds';
  end if;
  v_to_after := v_to_before + p_amount;

  -- Update balances (two-sided, atomic)
  update public.wallets
  set balance = v_from_after,
      updated_at = now()
  where id = v_from_wallet_id;

  update public.wallets
  set balance = v_to_after,
      updated_at = now()
  where id = v_to_wallet_id;

  v_desc_out := coalesce(p_description, 'panel transfer');
  v_desc_in  := coalesce(p_description, 'panel transfer');

  -- Ledger entries (two rows, shared transfer_id via source_ref)
  insert into public.transactions (
    id, wallet_id, user_id,
    type, status,
    amount, currency,
    description,
    balance_before, balance_after,
    source_kind, source_ref,
    meta,
    created_at
  ) values (
    gen_random_uuid(),
    v_from_wallet_id,
    v_from_user_id,
    'transfer_out'::public.transaction_type,
    'completed'::public.transaction_status,
    p_amount,
    'IRR',
    v_desc_out,
    v_from_before,
    v_from_after,
    'admin_panel_transfer',
    v_transfer_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'actor_id', v_actor,
      'target_id', p_target_id,
      'action', lower(p_action)
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  insert into public.transactions (
    id, wallet_id, user_id,
    type, status,
    amount, currency,
    description,
    balance_before, balance_after,
    source_kind, source_ref,
    meta,
    created_at
  ) values (
    gen_random_uuid(),
    v_to_wallet_id,
    v_to_user_id,
    'transfer_in'::public.transaction_type,
    'completed'::public.transaction_status,
    p_amount,
    'IRR',
    v_desc_in,
    v_to_before,
    v_to_after,
    'admin_panel_transfer',
    v_transfer_id::text,
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'actor_id', v_actor,
      'target_id', p_target_id,
      'action', lower(p_action)
    ) || coalesce(p_meta, '{}'::jsonb),
    now()
  );

  return query
    select v_transfer_id, v_actor, v_from_user_id, v_to_user_id;
end;
$$;

revoke all on function public.fn_wallet_transfer_panel(uuid, bigint, text, text, jsonb) from public;
grant execute on function public.fn_wallet_transfer_panel(uuid, bigint, text, text, jsonb) to authenticated;

commit;
