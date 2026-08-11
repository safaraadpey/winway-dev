-- Migration: Guard fn_join_or_create_room by user suspension (player / agent / super)
-- تاریخ: 2025-11-28
--
-- این مایگریشن، Wrapper تابع public.fn_join_or_create_room را به‌روزرسانی می‌کند
-- تا علاوه بر status تمپلیت (active / draining / inactive)، وضعیت تعلیق
-- خود پلیر و ایجنت/سوپر بالاسری او را هم بررسی کند.
--
-- قواعد:
-- - اگر خود پلیر status = 'suspended' باشد → اجازه ورود به اتاق ندارد.
-- - اگر agent او suspended باشد → اجازه ورود ندارد.
-- - اگر super او suspended باشد → اجازه ورود ندارد.
-- - اگر نقش کاربر فعلی player نباشد (مثلاً admin) → این چک‌ها نادیده گرفته می‌شود.

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_join_or_create_room(
  p_template_id uuid,
  p_card_count integer,
  p_password text DEFAULT NULL
)
RETURNS TABLE (
  room_id    uuid,
  starts_at  timestamptz,
  ticket_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_template_status public.room_template_status;

  v_user_id      uuid;
  v_user_role    text;
  v_user_status  text;
  v_parent_id    uuid;

  v_agent_id     uuid;
  v_super_id     uuid;
  v_agent_status text;
  v_super_status text;
  v_parent_role  text;
  v_parent_parent_id uuid;
BEGIN
  -- 0) کاربر فعلی را بشناس (player)؛ اگر auth.uid() برنگشت، از این چک عبور می‌کنیم
  BEGIN
    v_user_id := auth.uid();
  EXCEPTION
    WHEN others THEN
      v_user_id := NULL;
  END;

  IF v_user_id IS NOT NULL THEN
    SELECT role, status, parent_id
      INTO v_user_role, v_user_status, v_parent_id
    FROM public.users
    WHERE id = v_user_id;

    -- فقط برای player این محدودیت‌ها اعمال می‌شود
    IF FOUND AND v_user_role = 'player' THEN
      -- 0.1) اگر خود پلیر تعلیق شده باشد
      IF v_user_status = 'suspended' THEN
        RAISE EXCEPTION 'player account suspended';
      END IF;

      -- 0.2) گرفتن agent/super از player_affiliation
      SELECT agent_id, super_id
        INTO v_agent_id, v_super_id
      FROM public.player_affiliation
      WHERE user_id = v_user_id;

      -- اگر player_affiliation نداشتیم، از parent_id استفاده می‌کنیم
      IF NOT FOUND THEN
        IF v_parent_id IS NOT NULL THEN
          SELECT role, parent_id
            INTO v_parent_role, v_parent_parent_id
          FROM public.users
          WHERE id = v_parent_id;

          IF FOUND THEN
            IF v_parent_role = 'agent' THEN
              v_agent_id := v_parent_id;
              -- اگر agent خودش سوپر بالاسری دارد
              IF v_parent_parent_id IS NOT NULL THEN
                SELECT id
                  INTO v_super_id
                FROM public.users
                WHERE id = v_parent_parent_id
                  AND role = 'super';
              END IF;
            ELSIF v_parent_role = 'super' THEN
              v_super_id := v_parent_id;
            END IF;
          END IF;
        END IF;
      END IF;

      -- 0.3) اگر ایجنت تعلیق شده باشد
      IF v_agent_id IS NOT NULL THEN
        SELECT status
          INTO v_agent_status
        FROM public.users
        WHERE id = v_agent_id;

        IF FOUND AND v_agent_status = 'suspended' THEN
          RAISE EXCEPTION 'agent account suspended';
        END IF;
      END IF;

      -- 0.4) اگر سوپر تعلیق شده باشد
      IF v_super_id IS NOT NULL THEN
        SELECT status
          INTO v_super_status
        FROM public.users
        WHERE id = v_super_id;

        IF FOUND AND v_super_status = 'suspended' THEN
          RAISE EXCEPTION 'super account suspended';
        END IF;
      END IF;
    END IF;
  END IF;

  -- 1) خواندن وضعیت تمپلیت
  SELECT status
    INTO v_template_status
  FROM public.room_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  -- 2) جلوگیری از استفاده از تمپلیت آرشیوشده (inactive)
  IF v_template_status = 'inactive' THEN
    RAISE EXCEPTION 'room template is inactive';
  END IF;

  -- 3) فراخوانی فانکشن پایه و برگرداندن نتیجه
  RETURN QUERY
  SELECT room_id, starts_at, ticket_ids
  FROM public.fn_join_or_create_room_base(p_template_id, p_card_count, p_password);
END;
$function$;

COMMIT;


