begin;

create or replace function public.fn_dashboard_admin_commission_summary()
returns table(
  effective_user_id uuid,
  day_amount numeric,
  week_amount numeric,
  month_amount numeric,
  day_total numeric,
  week_total numeric,
  month_total numeric,
  day_tournament_amount numeric,
  week_tournament_amount numeric,
  month_tournament_amount numeric
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
  fee_ticket as (
    select
      coalesce(sum(t.amount) filter (where t.created_at >= date_trunc('day', b.n)), 0) as day_amount,
      coalesce(sum(t.amount) filter (where t.created_at >= date_trunc('week', b.n)), 0) as week_amount,
      coalesce(sum(t.amount) filter (where t.created_at >= date_trunc('month', b.n)), 0) as month_amount
    from public.transactions t
    cross join b
    where t.user_id = v_effective
      and t.type = 'fee_admin'
      and t.source_kind = 'ticket_commission'
  ),
  fee_tournament as (
    select
      coalesce(sum(s.admin_amount) filter (where s.created_at >= date_trunc('day', b.n)), 0) as day_amount,
      coalesce(sum(s.admin_amount) filter (where s.created_at >= date_trunc('week', b.n)), 0) as week_amount,
      coalesce(sum(s.admin_amount) filter (where s.created_at >= date_trunc('month', b.n)), 0) as month_amount
    from public.tournament_commission_snapshots s
    cross join b
    where s.admin_id = v_effective
       or s.admin_id is null
  ),
  base_ticket as (
    select
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('day', b.n)), 0) as day_total,
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('week', b.n)), 0) as week_total,
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('month', b.n)), 0) as month_total
    from public.commissions_log c
    cross join b
  ),
  base_tournament as (
    select
      coalesce(sum(s.commission_base) filter (where s.created_at >= date_trunc('day', b.n)), 0) as day_total,
      coalesce(sum(s.commission_base) filter (where s.created_at >= date_trunc('week', b.n)), 0) as week_total,
      coalesce(sum(s.commission_base) filter (where s.created_at >= date_trunc('month', b.n)), 0) as month_total
    from public.tournament_commission_snapshots s
    cross join b
    where s.admin_id = v_effective
       or s.admin_id is null
  )
  select
    v_effective as effective_user_id,
    fee_ticket.day_amount + fee_tournament.day_amount as day_amount,
    fee_ticket.week_amount + fee_tournament.week_amount as week_amount,
    fee_ticket.month_amount + fee_tournament.month_amount as month_amount,
    base_ticket.day_total + base_tournament.day_total as day_total,
    base_ticket.week_total + base_tournament.week_total as week_total,
    base_ticket.month_total + base_tournament.month_total as month_total,
    fee_tournament.day_amount as day_tournament_amount,
    fee_tournament.week_amount as week_tournament_amount,
    fee_tournament.month_amount as month_tournament_amount
  from fee_ticket, fee_tournament, base_ticket, base_tournament;
end;
$$;

revoke all on function public.fn_dashboard_admin_commission_summary() from public;
grant execute on function public.fn_dashboard_admin_commission_summary() to authenticated;

create or replace function public.fn_dashboard_admin_commission_summary_range(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  effective_user_id uuid,
  amount numeric,
  total numeric,
  tournament_amount numeric
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
  with fee_ticket as (
    select coalesce(sum(t.amount), 0) as amount
    from public.transactions t
    where t.user_id = v_effective
      and t.type = 'fee_admin'
      and t.source_kind = 'ticket_commission'
      and t.created_at >= p_from
      and t.created_at <= p_to
  ),
  fee_tournament as (
    select coalesce(sum(s.admin_amount), 0) as amount
    from public.tournament_commission_snapshots s
    where (s.admin_id = v_effective or s.admin_id is null)
      and s.created_at >= p_from
      and s.created_at <= p_to
  ),
  base_ticket as (
    select coalesce(sum(c.commission_base), 0) as total
    from public.commissions_log c
    where c.created_at >= p_from
      and c.created_at <= p_to
  ),
  base_tournament as (
    select coalesce(sum(s.commission_base), 0) as total
    from public.tournament_commission_snapshots s
    where (s.admin_id = v_effective or s.admin_id is null)
      and s.created_at >= p_from
      and s.created_at <= p_to
  )
  select
    v_effective as effective_user_id,
    fee_ticket.amount + fee_tournament.amount as amount,
    base_ticket.total + base_tournament.total as total,
    fee_tournament.amount as tournament_amount
  from fee_ticket, fee_tournament, base_ticket, base_tournament;
end;
$$;

revoke all on function public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz) from public;
grant execute on function public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz) to authenticated;

commit;

