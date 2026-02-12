begin;

drop function if exists public.fn_admin_games_report(timestamptz, timestamptz, integer, integer);

create function public.fn_admin_games_report(
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table(
  room_id uuid,
  room_title text,
  room_code text,
  room_amount numeric,
  played_at timestamptz,
  line_wins_count bigint,
  full_wins_count bigint,
  total_reward numeric,
  total_rows bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_RANGE';
  end if;

  return query
  with grouped as (
    select
      r.room_id,
      max(r.created_at) as played_at,
      count(*) filter (where lower(coalesce(r.win_type, '')) = 'line')::bigint as line_wins_count,
      count(*) filter (where lower(coalesce(r.win_type, '')) = 'full')::bigint as full_wins_count,
      coalesce(sum(r.reward_amount), 0)::numeric as total_reward
    from public.results r
    where r.room_id is not null
      and r.created_at >= p_from
      and r.created_at <= p_to
    group by r.room_id
  ),
  enriched as (
    select
      g.room_id,
      coalesce(
        nullif(trim(rm.title), ''),
        nullif(trim(rm.room_code), ''),
        concat('room-', left(g.room_id::text, 8))
      )::text as room_title,
      rm.room_code::text as room_code,
      coalesce(rm.price, rm.card_price, 0)::numeric as room_amount,
      g.played_at,
      g.line_wins_count,
      g.full_wins_count,
      g.total_reward
    from grouped g
    left join public.rooms rm on rm.id = g.room_id
  ),
  counted as (
    select
      e.*,
      count(*) over ()::bigint as total_rows
    from enriched e
  )
  select
    c.room_id,
    c.room_title,
    c.room_code,
    c.room_amount,
    c.played_at,
    c.line_wins_count,
    c.full_wins_count,
    c.total_reward,
    c.total_rows
  from counted c
  order by c.played_at desc
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

commit;

