begin;

create or replace function public.fn_dashboard_admin_commission_summary_range(
  p_from timestamptz,
  p_to timestamptz
)
returns table(
  effective_user_id uuid,
  amount numeric,
  total numeric
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
  select
    v_effective as effective_user_id,
    coalesce(
      (
        select sum(t.amount)
        from public.transactions t
        where t.user_id = v_effective
          and t.type = 'fee_admin'
          and t.source_kind = 'ticket_commission'
          and t.created_at >= p_from
          and t.created_at <= p_to
      ),
      0
    ) as amount,
    coalesce(
      (
        select sum(c.commission_base)
        from public.commissions_log c
        where c.created_at >= p_from
          and c.created_at <= p_to
      ),
      0
    ) as total;
end;
$$;

revoke all on function public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz) from public;
grant execute on function public.fn_dashboard_admin_commission_summary_range(timestamptz, timestamptz) to authenticated;

commit;

