-- Allow authenticated agent/super/admin users to update only their own referral_code.
-- This fixes silent no-op updates caused by RLS when no UPDATE policy exists.

begin;

drop policy if exists "Users can update own referral_code" on public.users;

create policy "Users can update own referral_code"
on public.users
for update
to authenticated
using (
  auth.uid() = id
  and role in ('admin', 'agent', 'super')
)
with check (
  auth.uid() = id
  and role in ('admin', 'agent', 'super')
  and (
    referral_code is null
    or referral_code ~ '^[A-Z0-9]{3,8}$'
  )
);

commit;

