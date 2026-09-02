alter table public.transfers
  add column if not exists shared_with_family boolean not null default false;

create index if not exists transfers_shared_household_month_idx
  on public.transfers(household_id, occurred_on, created_at)
  where deleted_at is null and shared_with_family = true and household_id is not null;

drop policy if exists transfers_owner_select on public.transfers;
drop policy if exists transfers_insert_valid_refs on public.transfers;
drop policy if exists transfers_update_valid_refs on public.transfers;

drop function if exists public.transfer_row_is_allowed(uuid, uuid, uuid, uuid, uuid, uuid, uuid);

create or replace function public.transfer_row_is_allowed(
  target_owner_user_id uuid,
  target_household_id uuid,
  target_shared_with_family boolean,
  target_from_account_id uuid,
  target_to_account_id uuid,
  target_from_fund_id uuid,
  target_to_fund_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_owner_user_id = target_user_id
    and (
      (coalesce(target_shared_with_family, false) = false and target_household_id is null)
      or (
        target_shared_with_family = true
        and public.is_active_household_member(target_household_id, target_user_id)
      )
    )
    and ((target_from_account_id is not null)::int + (target_from_fund_id is not null)::int = 1)
    and ((target_to_account_id is not null)::int + (target_to_fund_id is not null)::int = 1)
    and not (
      target_from_account_id is not null
      and target_to_account_id is not null
      and target_from_account_id = target_to_account_id
    )
    and not (
      target_from_fund_id is not null
      and target_to_fund_id is not null
      and target_from_fund_id = target_to_fund_id
    )
    and public.user_can_access_account(target_from_account_id, target_user_id, target_household_id)
    and public.user_can_access_account(target_to_account_id, target_user_id, target_household_id)
    and public.user_can_access_fund(target_from_fund_id, target_user_id, target_household_id)
    and public.user_can_access_fund(target_to_fund_id, target_user_id, target_household_id);
$$;

revoke all on function public.transfer_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.transfer_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, uuid, uuid) to authenticated;

create policy transfers_owner_or_family_select on public.transfers
for select using (
  owner_user_id = auth.uid()
  or (
    shared_with_family = true
    and household_id is not null
    and public.is_active_household_member(household_id, auth.uid())
  )
);

create policy transfers_insert_valid_refs on public.transfers
for insert with check (
  public.transfer_row_is_allowed(owner_user_id, household_id, shared_with_family, from_account_id, to_account_id, from_fund_id, to_fund_id, auth.uid())
);

create policy transfers_update_valid_refs on public.transfers
for update using (owner_user_id = auth.uid())
with check (
  public.transfer_row_is_allowed(owner_user_id, household_id, shared_with_family, from_account_id, to_account_id, from_fund_id, to_fund_id, auth.uid())
);
