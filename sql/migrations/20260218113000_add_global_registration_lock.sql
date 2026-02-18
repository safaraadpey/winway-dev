-- Migration: Add global registration lock and enforce in join RPC
-- Date: 2026-02-18

BEGIN;

-- Singleton runtime controls for global operational flags.
CREATE TABLE IF NOT EXISTS public.app_runtime_flags (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  global_registration_locked boolean NOT NULL DEFAULT false,
  global_registration_locked_at timestamptz NULL,
  global_registration_locked_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  global_registration_lock_reason text NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_runtime_flags (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

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
  v_global_registration_locked boolean := false;

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

  -- 1) قفل سراسری ثبت‌نام
  SELECT global_registration_locked
    INTO v_global_registration_locked
  FROM public.app_runtime_flags
  WHERE id = true;

  IF COALESCE(v_global_registration_locked, false) THEN
    RAISE EXCEPTION 'global registration locked';
  END IF;

  -- 2) وضعیت تمپلیت
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

  -- 3) فراخوانی شیم پایه
  RETURN QUERY
  SELECT base_result.room_id, base_result.starts_at, base_result.ticket_ids
  FROM public.fn_join_or_create_room_base(p_template_id, p_card_count, p_password)
       AS base_result;
END;
$function$;

COMMIT;
