begin;

create or replace function public.fn_dashboard_admin_tournament_guarantee_summary()
returns table(
  effective_user_id uuid,
  day_amount numeric,
  week_amount numeric,
  month_amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select u.role::text
    into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  return query
  with b as (
    select now() as n
  ),
  prizes_day as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    cross join b
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= date_trunc('day', b.n)
    group by t.source_ref
  ),
  pools_day as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes_day p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg_day as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(pd.pool_amount, 0), 0)), 0) as amount
    from prizes_day p
    left join pools_day pd on pd.tournament_id = p.tournament_id
  ),
  prizes_week as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    cross join b
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= date_trunc('week', b.n)
    group by t.source_ref
  ),
  pools_week as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes_week p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg_week as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(pw.pool_amount, 0), 0)), 0) as amount
    from prizes_week p
    left join pools_week pw on pw.tournament_id = p.tournament_id
  ),
  prizes_month as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    cross join b
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= date_trunc('month', b.n)
    group by t.source_ref
  ),
  pools_month as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes_month p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg_month as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(pm.pool_amount, 0), 0)), 0) as amount
    from prizes_month p
    left join pools_month pm on pm.tournament_id = p.tournament_id
  )
  select
    v_effective as effective_user_id,
    agg_day.amount as day_amount,
    agg_week.amount as week_amount,
    agg_month.amount as month_amount
  from agg_day, agg_week, agg_month;
end;
$$;

revoke all on function public.fn_dashboard_admin_tournament_guarantee_summary() from public;
grant execute on function public.fn_dashboard_admin_tournament_guarantee_summary() to authenticated;

create or replace function public.fn_dashboard_admin_tournament_guarantee_summary_range(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  effective_user_id uuid,
  amount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_role text;
  v_adminzero_id uuid;
  v_effective uuid;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_RANGE';
  end if;

  select u.role::text
    into v_actor_role
  from public.users u
  where u.id = v_actor;

  if v_actor_role is distinct from 'admin' then
    raise exception 'FORBIDDEN';
  end if;

  select u.id
    into v_adminzero_id
  from public.users u
  where u.username = 'adminzero'
    and u.role = 'admin'
  limit 1;

  v_effective := coalesce(v_adminzero_id, v_actor);

  return query
  with prizes as (
    select t.source_ref as tournament_id, coalesce(sum(t.amount), 0) as prize_amount
    from public.transactions t
    where t.source_kind = 'tournament_prize'
      and t.type = 'win'
      and t.created_at >= p_from
      and t.created_at <= p_to
    group by t.source_ref
  ),
  pools as (
    select s.tournament_id::text as tournament_id, coalesce(sum(s.amount_to_pool), 0) as pool_amount
    from public.tournament_commission_snapshots s
    join prizes p on p.tournament_id = s.tournament_id::text
    group by s.tournament_id::text
  ),
  agg as (
    select coalesce(sum(greatest(p.prize_amount - coalesce(po.pool_amount, 0), 0)), 0) as amount
    from prizes p
    left join pools po on po.tournament_id = p.tournament_id
  )
  select
    v_effective as effective_user_id,
    agg.amount as amount
  from agg;
end;
$$;

revoke all on function public.fn_dashboard_admin_tournament_guarantee_summary_range(timestamptz, timestamptz) from public;
grant execute on function public.fn_dashboard_admin_tournament_guarantee_summary_range(timestamptz, timestamptz) to authenticated;

commit;
