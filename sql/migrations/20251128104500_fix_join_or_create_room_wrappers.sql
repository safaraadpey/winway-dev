-- Migration: fix join/create-room wrappers after core refactor
-- تاریخ: 2025-11-28
--
-- اهداف:
-- 1) اطمینان از این‌که public.fn_join_or_create_room_base دقیقاً به هسته‌ی جدید
--    game_core.fn_join_or_create_room_core پاس می‌دهد.
-- 2) رفع خطای «column reference "room_id" is ambiguous» در public.fn_join_or_create_room
--    با استفاده از RETURN QUERY SELECT * (همان الگوی به‌کاررفته در شیم پایه).

BEGIN;

-- ========================================================================
-- 1) پایه‌ی public → game_core
-- ========================================================================

CREATE OR REPLACE FUNCTION public.fn_join_or_create_room_base(
  p_template_id uuid,
  p_card_count integer,
  p_password text
)
RETURNS TABLE (
  room_id    uuid,
  starts_at  timestamptz,
  ticket_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- از RETURN QUERY SELECT * استفاده می‌کنیم تا نام ستون‌ها (room_id و ...) بین
  -- خروجی TABLE و نتیجه‌ی تابع core مبهم نشود.
  RETURN QUERY
  SELECT *
  FROM game_core.fn_join_or_create_room_core(p_template_id, p_card_count, p_password);
END;
$function$;

-- ========================================================================
-- 2) Wrapper RPC عمومی
-- ========================================================================

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
  -- 0) کاربر فعلی (player)
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

    IF FOUND AND v_user_role = 'player' THEN
      IF v_user_status = 'suspended' THEN
        RAISE EXCEPTION 'player account suspended';
      END IF;

      SELECT agent_id, super_id
        INTO v_agent_id, v_super_id
      FROM public.player_affiliation
      WHERE user_id = v_user_id;

      IF NOT FOUND THEN
        IF v_parent_id IS NOT NULL THEN
          SELECT role, parent_id
            INTO v_parent_role, v_parent_parent_id
          FROM public.users
          WHERE id = v_parent_id;

          IF FOUND THEN
            IF v_parent_role = 'agent' THEN
              v_agent_id := v_parent_id;
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

      IF v_agent_id IS NOT NULL THEN
        SELECT status
          INTO v_agent_status
        FROM public.users
        WHERE id = v_agent_id;

        IF FOUND AND v_agent_status = 'suspended' THEN
          RAISE EXCEPTION 'agent account suspended';
        END IF;
      END IF;

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

  -- 1) وضعیت تمپلیت
  SELECT status
    INTO v_template_status
  FROM public.room_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'room template not found: %', p_template_id;
  END IF;

  IF v_template_status = 'inactive' THEN
    RAISE EXCEPTION 'room template is inactive';
  END IF;

  -- 2) فراخوانی شیم پایه (که حالا خودش core را صدا می‌زند)
  RETURN QUERY
  SELECT *
  FROM public.fn_join_or_create_room_base(p_template_id, p_card_count, p_password);
END;
$function$;

COMMIT;


