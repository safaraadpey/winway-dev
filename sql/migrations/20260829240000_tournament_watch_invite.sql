-- Tournament watch invite: public watch_code, per-player opaque tokens, admin banner.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.tournaments_watch_code_seq START WITH 781;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS watch_code integer;

UPDATE public.tournaments t
   SET watch_code = sub.rn
  FROM (
    SELECT id, (781 + ROW_NUMBER() OVER (ORDER BY created_at, id) - 1)::int AS rn
    FROM public.tournaments
    WHERE watch_code IS NULL
  ) sub
 WHERE t.id = sub.id
   AND t.watch_code IS NULL;

ALTER TABLE public.tournaments
  ALTER COLUMN watch_code SET DEFAULT nextval('public.tournaments_watch_code_seq');

SELECT setval(
  'public.tournaments_watch_code_seq',
  GREATEST(COALESCE((SELECT MAX(watch_code) FROM public.tournaments), 781), 781)
);

ALTER TABLE public.tournaments
  ALTER COLUMN watch_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournaments_watch_code_unique
  ON public.tournaments (watch_code);

CREATE OR REPLACE FUNCTION public.fn_tournaments_assign_watch_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.watch_code IS NULL THEN
    NEW.watch_code := nextval('public.tournaments_watch_code_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournaments_assign_watch_code ON public.tournaments;
CREATE TRIGGER trg_tournaments_assign_watch_code
  BEFORE INSERT ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_tournaments_assign_watch_code();

CREATE TABLE IF NOT EXISTS public.player_watch_invite_tokens (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_watch_invite_tokens_token_unique UNIQUE (token),
  CONSTRAINT player_watch_invite_tokens_token_format CHECK (token ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6,12}$')
);

CREATE INDEX IF NOT EXISTS player_watch_invite_tokens_token_idx
  ON public.player_watch_invite_tokens (token);

REVOKE ALL ON TABLE public.player_watch_invite_tokens FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_watch_invite_tokens TO service_role;

CREATE TABLE IF NOT EXISTS public.watch_invite_banner_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  title text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  image_url text,
  image_size integer,
  image_width integer,
  image_height integer,
  is_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id) ON DELETE SET NULL
);

INSERT INTO public.watch_invite_banner_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE public.watch_invite_banner_settings FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watch_invite_banner_settings TO service_role;

-- Storage: allow watch-invite-banners folder in banner-images bucket
DROP POLICY IF EXISTS "manager_admins_upload_watch_invite_banners" ON storage.objects;
CREATE POLICY "manager_admins_upload_watch_invite_banners"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'banner-images'
  AND (storage.foldername(name))[1] = 'watch-invite-banners'
  AND EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'admin'::public.user_role
      AND u.admin_sub_role IS NULL
      AND u.status = 'active'::public.user_status
  )
);

COMMIT;
