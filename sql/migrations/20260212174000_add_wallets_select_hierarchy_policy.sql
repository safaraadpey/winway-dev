begin;

drop policy if exists "wallets_select_hierarchy" on public.wallets;

create policy "wallets_select_hierarchy"
on public.wallets
for select
to authenticated
using (
  -- always can see own wallet
  user_id = auth.uid()
  or exists (
    select 1
    from public.users actor
    where actor.id = auth.uid()
      and (
        -- admin can see all wallets
        actor.role = 'admin'
        or (
          -- super can see direct agents/players and affiliated players
          actor.role = 'super'
          and (
            exists (
              select 1
              from public.users target
              where target.id = wallets.user_id
                and (
                  (target.role = 'agent' and target.parent_id = actor.id)
                  or (target.role = 'player' and target.parent_id = actor.id)
                )
            )
            or exists (
              select 1
              from public.player_affiliation pa
              where pa.user_id = wallets.user_id
                and pa.super_id = actor.id
            )
          )
        )
        or (
          -- agent can see direct agents/players and affiliated players
          actor.role = 'agent'
          and (
            exists (
              select 1
              from public.users target
              where target.id = wallets.user_id
                and (
                  (target.role = 'agent' and target.parent_id = actor.id)
                  or (target.role = 'player' and target.parent_id = actor.id)
                )
            )
            or exists (
              select 1
              from public.player_affiliation pa
              where pa.user_id = wallets.user_id
                and pa.agent_id = actor.id
            )
          )
        )
      )
  )
);

comment on policy "wallets_select_hierarchy" on public.wallets is
  'Allow admin/super/agent to read wallets for permitted downline users.';

commit;
