-- Denormalized direct downline counts (admin-tree) + platform role totals.
-- Maintained by triggers on users and player_affiliation.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS direct_managed_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_direct_managed_count_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_direct_managed_count_check CHECK (direct_managed_count >= 0);

CREATE TABLE IF NOT EXISTS public.platform_user_role_stats (
  id smallint PRIMARY KEY CHECK (id = 1),
  player_count integer NOT NULL DEFAULT 0 CHECK (player_count >= 0),
  agent_count integer NOT NULL DEFAULT 0 CHECK (agent_count >= 0),
  super_count integer NOT NULL DEFAULT 0 CHECK (super_count >= 0),
  admin_count integer NOT NULL DEFAULT 0 CHECK (admin_count >= 0),
  managed_visible_total integer NOT NULL DEFAULT 0 CHECK (managed_visible_total >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_user_role_stats (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- Admin-tree direct parent (matches services/users.ts resolveParentId for admin viewer).
CREATE OR REPLACE FUNCTION public.fn_users_admin_tree_parent(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path TO public
AS $$
DECLARE
  v_role public.user_role;
  v_parent_id uuid;
  v_agent_id uuid;
  v_super_id uuid;
  v_parent_role public.user_role;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.role, u.parent_id
    INTO v_role, v_parent_id
  FROM public.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_role IN ('admin', 'super') THEN
    RETURN NULL;
  END IF;

  IF v_role = 'agent' THEN
    IF v_parent_id IS NOT NULL THEN
      SELECT u.role INTO v_parent_role
      FROM public.users u
      WHERE u.id = v_parent_id;
      IF v_parent_role = 'super' THEN
        RETURN v_parent_id;
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  -- player
  SELECT pa.agent_id, pa.super_id
    INTO v_agent_id, v_super_id
  FROM public.player_affiliation pa
  WHERE pa.user_id = p_user_id;

  IF v_agent_id IS NOT NULL THEN
    RETURN v_agent_id;
  END IF;
  IF v_super_id IS NOT NULL THEN
    RETURN v_super_id;
  END IF;
  RETURN v_parent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_users_is_managed_visible(
  p_username text,
  p_admin_sub_role public.admin_sub_role
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO public
AS $$
  SELECT NOT (
    COALESCE(p_username, '') = 'adminzero'
    OR COALESCE(p_admin_sub_role::text, '') = 'dev_panel'
  );
$$;

CREATE OR REPLACE FUNCTION public.fn_users_adjust_direct_managed_count(
  p_parent_id uuid,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF p_parent_id IS NULL OR p_delta = 0 THEN
    RETURN;
  END IF;

  UPDATE public.users u
  SET direct_managed_count = GREATEST(0, u.direct_managed_count + p_delta)
  WHERE u.id = p_parent_id
    AND u.role IN ('agent', 'super');
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_users_adjust_platform_role_stats(
  p_role public.user_role,
  p_visible boolean,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF p_delta = 0 THEN
    RETURN;
  END IF;

  UPDATE public.platform_user_role_stats s
  SET
    player_count = GREATEST(0, s.player_count + CASE WHEN p_role = 'player' THEN p_delta ELSE 0 END),
    agent_count = GREATEST(0, s.agent_count + CASE WHEN p_role = 'agent' THEN p_delta ELSE 0 END),
    super_count = GREATEST(0, s.super_count + CASE WHEN p_role = 'super' THEN p_delta ELSE 0 END),
    admin_count = GREATEST(0, s.admin_count + CASE WHEN p_role = 'admin' THEN p_delta ELSE 0 END),
    managed_visible_total = GREATEST(0, s.managed_visible_total + CASE WHEN p_visible THEN p_delta ELSE 0 END),
    updated_at = now()
  WHERE s.id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_users_apply_managed_membership_delta(
  p_old_tree_parent uuid,
  p_new_tree_parent uuid,
  p_old_role public.user_role,
  p_new_role public.user_role,
  p_old_visible boolean,
  p_new_visible boolean
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO public
AS $$
BEGIN
  IF p_old_tree_parent IS DISTINCT FROM p_new_tree_parent THEN
    PERFORM public.fn_users_adjust_direct_managed_count(p_old_tree_parent, -1);
    PERFORM public.fn_users_adjust_direct_managed_count(p_new_tree_parent, 1);
  END IF;

  IF p_old_role IS DISTINCT FROM p_new_role THEN
    PERFORM public.fn_users_adjust_platform_role_stats(p_old_role, p_old_visible, -1);
    PERFORM public.fn_users_adjust_platform_role_stats(p_new_role, p_new_visible, 1);
  ELSIF p_old_visible IS DISTINCT FROM p_new_visible THEN
    PERFORM public.fn_users_adjust_platform_role_stats(p_new_role, p_old_visible, -1);
    PERFORM public.fn_users_adjust_platform_role_stats(p_new_role, p_new_visible, 1);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_users_managed_counts_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_old_parent uuid;
  v_new_parent uuid;
  v_old_visible boolean;
  v_new_visible boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_parent := public.fn_users_admin_tree_parent(NEW.id);
    v_new_visible := public.fn_users_is_managed_visible(NEW.username, NEW.admin_sub_role);
    -- Players get direct_managed_count from player_affiliation trigger after affiliation row exists.
    IF NEW.role <> 'player' THEN
      PERFORM public.fn_users_adjust_direct_managed_count(v_new_parent, 1);
    END IF;
    PERFORM public.fn_users_adjust_platform_role_stats(NEW.role, v_new_visible, 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_old_parent := public.fn_users_admin_tree_parent(OLD.id);
    v_old_visible := public.fn_users_is_managed_visible(OLD.username, OLD.admin_sub_role);
    PERFORM public.fn_users_adjust_direct_managed_count(v_old_parent, -1);
    PERFORM public.fn_users_adjust_platform_role_stats(OLD.role, v_old_visible, -1);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_parent := public.fn_users_admin_tree_parent(OLD.id);
    v_new_parent := public.fn_users_admin_tree_parent(NEW.id);
    v_old_visible := public.fn_users_is_managed_visible(OLD.username, OLD.admin_sub_role);
    v_new_visible := public.fn_users_is_managed_visible(NEW.username, NEW.admin_sub_role);

    IF OLD.role IS DISTINCT FROM NEW.role
       OR OLD.parent_id IS DISTINCT FROM NEW.parent_id
       OR OLD.username IS DISTINCT FROM NEW.username
       OR OLD.admin_sub_role IS DISTINCT FROM NEW.admin_sub_role THEN
      PERFORM public.fn_users_apply_managed_membership_delta(
        v_old_parent,
        v_new_parent,
        OLD.role,
        NEW.role,
        v_old_visible,
        v_new_visible
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_managed_counts ON public.users;

CREATE TRIGGER trg_users_managed_counts
  AFTER INSERT OR DELETE OR UPDATE OF role, parent_id, username, admin_sub_role
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_users_managed_counts_fn();

CREATE OR REPLACE FUNCTION public.trg_player_affiliation_managed_counts_fn()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO public
AS $$
DECLARE
  v_user_id uuid;
  v_old_parent uuid;
  v_new_parent uuid;
  v_role public.user_role;
  v_username text;
  v_admin_sub_role public.admin_sub_role;
  v_visible boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  SELECT u.role, u.username, u.admin_sub_role
    INTO v_role, v_username, v_admin_sub_role
  FROM public.users u
  WHERE u.id = v_user_id;

  IF NOT FOUND OR v_role <> 'player' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_visible := public.fn_users_is_managed_visible(v_username, v_admin_sub_role);

  IF TG_OP = 'INSERT' THEN
    v_new_parent := public.fn_users_admin_tree_parent(v_user_id);
    PERFORM public.fn_users_adjust_direct_managed_count(v_new_parent, 1);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- User DELETE trigger already adjusted counts while affiliation row still existed.
    IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.user_id) THEN
      v_old_parent := public.fn_users_admin_tree_parent(v_user_id);
      PERFORM public.fn_users_adjust_direct_managed_count(v_old_parent, -1);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.agent_id IS NOT DISTINCT FROM NEW.agent_id
       AND OLD.super_id IS NOT DISTINCT FROM NEW.super_id THEN
      RETURN NEW;
    END IF;

    -- Reconstruct old parent without NEW affiliation values.
    IF OLD.agent_id IS NOT NULL THEN
      v_old_parent := OLD.agent_id;
    ELSIF OLD.super_id IS NOT NULL THEN
      v_old_parent := OLD.super_id;
    ELSE
      SELECT u.parent_id INTO v_old_parent FROM public.users u WHERE u.id = v_user_id;
    END IF;

    v_new_parent := public.fn_users_admin_tree_parent(v_user_id);

    IF v_old_parent IS DISTINCT FROM v_new_parent THEN
      PERFORM public.fn_users_adjust_direct_managed_count(v_old_parent, -1);
      PERFORM public.fn_users_adjust_direct_managed_count(v_new_parent, 1);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_affiliation_managed_counts ON public.player_affiliation;

CREATE TRIGGER trg_player_affiliation_managed_counts
  AFTER INSERT OR DELETE OR UPDATE OF agent_id, super_id
  ON public.player_affiliation
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_player_affiliation_managed_counts_fn();

-- Backfill direct_managed_count
UPDATE public.users
SET direct_managed_count = 0;

UPDATE public.users p
SET direct_managed_count = c.cnt
FROM (
  SELECT tp AS parent_id, COUNT(*)::integer AS cnt
  FROM public.users u
  CROSS JOIN LATERAL (
    SELECT public.fn_users_admin_tree_parent(u.id) AS tp
  ) t
  WHERE t.tp IS NOT NULL
  GROUP BY tp
) c
WHERE p.id = c.parent_id;

-- Backfill platform_user_role_stats
UPDATE public.platform_user_role_stats s
SET
  player_count = (SELECT COUNT(*)::integer FROM public.users u WHERE u.role = 'player'),
  agent_count = (SELECT COUNT(*)::integer FROM public.users u WHERE u.role = 'agent'),
  super_count = (SELECT COUNT(*)::integer FROM public.users u WHERE u.role = 'super'),
  admin_count = (SELECT COUNT(*)::integer FROM public.users u WHERE u.role = 'admin'),
  managed_visible_total = (
    SELECT COUNT(*)::integer
    FROM public.users u
    WHERE public.fn_users_is_managed_visible(u.username, u.admin_sub_role)
  ),
  updated_at = now()
WHERE s.id = 1;

COMMENT ON COLUMN public.users.direct_managed_count IS
  'Direct admin-tree downline count for agent/super rows; maintained by trg_users_managed_counts.';

COMMENT ON TABLE public.platform_user_role_stats IS
  'Singleton platform role totals for admin managed-users header; maintained by user/affiliation triggers.';
