-- Stagger tournament room creation: fn_tick_tournament can seat at most
-- p_max_new_rooms unseated tables per call (engine spreads DB load).
-- Also: a round is not complete while any table still has no room_id.

BEGIN;

DROP FUNCTION IF EXISTS public.fn_tick_tournament(uuid, bigint, integer[]);
DROP FUNCTION IF EXISTS tournament.fn_tick_tournament(uuid, bigint, integer[]);

CREATE FUNCTION tournament.fn_tick_tournament(
  p_tournament_id uuid,
  p_seed bigint DEFAULT NULL::bigint,
  p_batch_tables integer[] DEFAULT NULL::integer[],
  p_max_new_rooms integer DEFAULT NULL::integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'tournament', 'public', 'pg_temp'
AS $$
declare
  v_now timestamptz := now();
  v_t   public.tournaments%rowtype;

  v_curr_round int;
  v_last_round_finished boolean;
  v_has_rounds boolean;

  v_table_no integer;
  v_entries_count int := 0;
  v_seat_limit int;
begin
  -- 1) قفل کردن تورنومنت (برای جلوگیری از اجرای همزمان)
  select *
    into v_t
  from public.tournaments
  where id = p_tournament_id
  for update nowait;

  if not found then
    raise exception 'tournament not found: %', p_tournament_id;
  end if;

  -- 2) شرط شروع: registration_open → running وقتی start_at رسیده
  if v_t.status = 'registration_open'::public.tournament_status then
    if v_t.start_at is null or v_t.start_at <= v_now then
      select count(*)
        into v_entries_count
      from public.tournament_entries
      where tournament_id = p_tournament_id
        and status = 'created';

      if v_entries_count = 0 then
        update public.tournaments
           set start_at  = v_now + interval '1 hour',
               updated_at = v_now
         where id = p_tournament_id;
        return;
      end if;

      update public.tournaments
         set status     = 'running'::public.tournament_status,
             updated_at = v_now
       where id = p_tournament_id;

      v_t.status := 'running'::public.tournament_status;
    else
      return;
    end if;
  end if;

  -- فقط تورنومنت‌های running را ادامه می‌دهیم
  if v_t.status <> 'running'::public.tournament_status then
    return;
  end if;

  -- 3) همگام‌سازی وضعیت round_rooms با وضعیت room واقعی (best-effort)
  update public.tournament_round_rooms trr
     set status = case
                   when r.status = 'finished'
                     then 'finished'::public.tournament_round_room_status
                   when r.status in ('playing','live','settling')
                     then 'running'::public.tournament_round_room_status
                   when r.status = 'waiting'
                     then trr.status
                   else trr.status
                  end
  from public.rooms r
  where trr.tournament_id = p_tournament_id
    and trr.room_id is not null
    and trr.room_id = r.id;

  -- 4) اگر هنوز هیچ راندی ساخته نشده، راند ۱ را بساز
  select coalesce(max(round_no), 0)
    into v_curr_round
  from public.tournament_round_rooms
  where tournament_id = p_tournament_id;

  v_has_rounds := (v_curr_round > 0);

  if not v_has_rounds then
    perform tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed);

    select coalesce(max(round_no), 0)
      into v_curr_round
    from public.tournament_round_rooms
    where tournament_id = p_tournament_id;
  end if;

  if v_curr_round = 0 then
    return;
  end if;

  -- 5a) تخصیص تمپلیت برای میزهای این راند (batch-aware)
  perform tournament.fn_assign_templates_for_round(
    p_tournament_id := p_tournament_id,
    p_round_no      := v_curr_round,
    p_batch_tables  := p_batch_tables
  );

  -- 5b) نشاندن بازیکن‌ها. p_max_new_rooms محدود می‌کند چند میز بدون room
  --     در این tick ساخته شود (NULL = همه، مثل قبل).
  v_seat_limit := case
    when p_max_new_rooms is null then 2147483647
    when p_max_new_rooms <= 0 then 0
    else p_max_new_rooms
  end;

  for v_table_no in
    select trr.table_no
    from public.tournament_round_rooms trr
    where trr.tournament_id = p_tournament_id
      and trr.round_no      = v_curr_round
      and (p_batch_tables is null or trr.table_no = any(p_batch_tables))
      and (p_max_new_rooms is null or trr.room_id is null)
    order by trr.table_no
    limit v_seat_limit
  loop
    perform tournament.fn_seat_table_players(
      p_tournament_id := p_tournament_id,
      p_round_no      := v_curr_round,
      p_table_no      := v_table_no
    );
  end loop;

  -- 5c) اگر روم‌ها waiting هستند و starts_at ندارند، شروع را زمان‌بندی کن
  update public.rooms r
     set starts_at = v_now + make_interval(secs => r.countdown_sec),
         updated_at = v_now
    from public.tournament_round_rooms trr
   where trr.tournament_id = p_tournament_id
     and trr.round_no      = v_curr_round
     and trr.room_id       = r.id
     and r.status          = 'waiting'::public.room_status
     and r.starts_at is null;

  -- 6) پایان راند: همه میزها باید room داشته باشند و finished باشند.
  --    میز بدون room_id هنوز تمام نشده (لازم برای seating تدریجی).
  select
    exists (
      select 1
      from public.tournament_round_rooms trr
      where trr.tournament_id = p_tournament_id
        and trr.round_no = v_curr_round
    )
    and not exists (
      select 1
      from public.tournament_round_rooms trr
      left join public.rooms r on r.id = trr.room_id
      where trr.tournament_id = p_tournament_id
        and trr.round_no = v_curr_round
        and (
          trr.room_id is null
          or r.id is null
          or r.status is distinct from 'finished'::public.room_status
        )
    )
    into v_last_round_finished;

  if v_last_round_finished then
    perform tournament.fn_manage_tournament_cycle(p_tournament_id, p_seed);
  end if;

  return;
end;
$$;

CREATE FUNCTION public.fn_tick_tournament(
  p_tournament_id uuid,
  p_seed bigint DEFAULT NULL::bigint,
  p_batch_tables integer[] DEFAULT NULL::integer[],
  p_max_new_rooms integer DEFAULT NULL::integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'tournament'
AS $$
  SELECT tournament.fn_tick_tournament(
    p_tournament_id,
    p_seed,
    p_batch_tables,
    p_max_new_rooms
  );
$$;

GRANT ALL ON FUNCTION public.fn_tick_tournament(uuid, bigint, integer[], integer)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
