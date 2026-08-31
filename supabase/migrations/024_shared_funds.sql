alter table public.funds
add column if not exists household_id uuid references public.households(id) on delete set null,
add column if not exists shared_with_family boolean not null default false;

alter table public.funds
drop constraint if exists funds_shared_household_consistency;

alter table public.funds
add constraint funds_shared_household_consistency check (
  (shared_with_family = true and household_id is not null)
  or (shared_with_family = false and household_id is null)
);

create index if not exists funds_household_shared_idx
  on public.funds(household_id, shared_with_family)
  where deleted_at is null and shared_with_family = true;

drop policy if exists funds_owner_select on public.funds;
drop policy if exists funds_owner_insert on public.funds;
drop policy if exists funds_owner_update on public.funds;

create policy funds_owner_or_shared_household_select on public.funds
for select using (
  owner_user_id = auth.uid()
  or (
    shared_with_family = true
    and deleted_at is null
    and public.is_active_household_member(household_id, auth.uid())
  )
);

create policy funds_owner_insert on public.funds
for insert with check (
  owner_user_id = auth.uid()
  and (
    (shared_with_family = false and household_id is null)
    or (
      shared_with_family = true
      and public.is_active_household_member(household_id, auth.uid())
    )
  )
);

create policy funds_owner_update on public.funds
for update using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and (
    (shared_with_family = false and household_id is null)
    or (
      shared_with_family = true
      and public.is_active_household_member(household_id, auth.uid())
    )
  )
);
