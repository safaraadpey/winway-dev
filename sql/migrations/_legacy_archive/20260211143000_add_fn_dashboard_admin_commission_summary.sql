-- Admin dashboard commission summary (service-definer RPC).
-- Returns:
-- - admin commission (day/week/month) for effective admin user (adminzero if exists)
-- - total commission_base (day/week/month) across commissions_log

begin;

create or replace function public.fn_dashboard_admin_commission_summary()
returns table(
  effective_user_id uuid,
  day_amount numeric,
  week_amount numeric,
  month_amount numeric,
  day_total numeric,
  week_total numeric,
  month_total numeric
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
  fee as (
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
  base as (
    select
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('day', b.n)), 0) as day_total,
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('week', b.n)), 0) as week_total,
      coalesce(sum(c.commission_base) filter (where c.created_at >= date_trunc('month', b.n)), 0) as month_total
    from public.commissions_log c
    cross join b
  )
  select
    v_effective as effective_user_id,
    fee.day_amount,
    fee.week_amount,
    fee.month_amount,
    base.day_total,
    base.week_total,
    base.month_total
  from fee, base;
end;
$$;

revoke all on function public.fn_dashboard_admin_commission_summary() from public;
grant execute on function public.fn_dashboard_admin_commission_summary() to authenticated;

commit;

