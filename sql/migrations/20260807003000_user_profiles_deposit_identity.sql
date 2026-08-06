-- Deposit identity: full legal name + mobile for HamiPay (first-write locked).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.user_profiles.full_name IS
  'Player full name (نام و نام خانوادگی) for fiat deposit / HamiPay. First-write locked.';

COMMENT ON COLUMN public.user_profiles.phone IS
  'Player mobile for fiat deposit / HamiPay (09xxxxxxxxx). First-write locked.';

-- Optional format guards (NULL allowed until first deposit)
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_full_name_len_chk;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_full_name_len_chk
  CHECK (full_name IS NULL OR char_length(btrim(full_name)) BETWEEN 3 AND 120);

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_phone_format_chk;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_phone_format_chk
  CHECK (phone IS NULL OR phone ~ '^09[0-9]{9}$');

CREATE OR REPLACE FUNCTION public.tg_user_profiles_lock_deposit_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.full_name IS NOT NULL
     AND NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    RAISE EXCEPTION 'full_name is locked after first write'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.phone IS NOT NULL
     AND NEW.phone IS DISTINCT FROM OLD.phone THEN
    RAISE EXCEPTION 'phone is locked after first write'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_lock_deposit_identity
  ON public.user_profiles;

CREATE TRIGGER trg_user_profiles_lock_deposit_identity
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_user_profiles_lock_deposit_identity();
