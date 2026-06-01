-- Fix signup: handle_new_user must run on auth.users INSERT (not public.users).
-- Without this, signUp creates auth row only and login fails when reading public.users.

DROP TRIGGER IF EXISTS on_auth_user_created ON public.users;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
