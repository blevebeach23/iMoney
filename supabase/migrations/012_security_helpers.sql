-- SECURITY DEFINER is used here to evaluate membership and ownership without
-- recursive RLS checks on household_members and related ownership tables.
create or replace function public.is_active_household_member(target_household_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_household_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = target_household_id
        and hm.user_id = target_user_id
        and hm.status = 'ACTIVE'
    );
$$;

create or replace function public.is_household_admin(target_household_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_household_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = target_household_id
        and hm.user_id = target_user_id
        and hm.status = 'ACTIVE'
        and hm.role in ('owner', 'admin')
    );
$$;

create or replace function public.user_can_access_account(target_account_id uuid, target_user_id uuid, target_household_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_account_id is null
    or exists (
      select 1
      from public.accounts a
      where a.id = target_account_id
        and a.owner_user_id = target_user_id
        and a.deleted_at is null
    );
$$;

create or replace function public.user_can_access_fund(target_fund_id uuid, target_user_id uuid, target_household_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_fund_id is null
    or exists (
      select 1
      from public.funds f
      where f.id = target_fund_id
        and f.owner_user_id = target_user_id
        and f.deleted_at is null
    );
$$;

create or replace function public.user_can_access_category(target_category_id uuid, target_user_id uuid, target_household_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.categories c
    join public.macro_categories mc on mc.id = c.macro_category_id
    where c.id = target_category_id
      and (
        mc.owner_user_id = target_user_id
        or (
          mc.household_id is not null
          and (target_household_id is null or target_household_id = mc.household_id)
          and public.is_active_household_member(mc.household_id, target_user_id)
        )
      )
  );
$$;

create or replace function public.user_can_access_import_batch(target_import_batch_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_import_batch_id is null
    or exists (
      select 1
      from public.import_batches ib
      where ib.id = target_import_batch_id
        and ib.owner_user_id = target_user_id
    );
$$;

create or replace function public.user_can_reference_reimbursement(target_movement_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_movement_id is null
    or exists (
      select 1
      from public.movements m
      where m.id = target_movement_id
        and m.owner_user_id = target_user_id
        and m.type = 'expense'
        and m.deleted_at is null
    );
$$;

create or replace function public.movement_row_is_allowed(
  target_owner_user_id uuid,
  target_household_id uuid,
  target_shared_with_family boolean,
  target_account_id uuid,
  target_fund_id uuid,
  target_category_id uuid,
  target_type public.movement_type,
  target_reimbursement_for_movement_id uuid,
  target_import_batch_id uuid,
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
      (target_shared_with_family = false and target_household_id is null)
      or (
        target_shared_with_family = true
        and public.is_active_household_member(target_household_id, target_user_id)
      )
    )
    and ((target_account_id is not null)::int + (target_fund_id is not null)::int = 1)
    and public.user_can_access_account(target_account_id, target_user_id, target_household_id)
    and public.user_can_access_fund(target_fund_id, target_user_id, target_household_id)
    and public.user_can_access_category(target_category_id, target_user_id, target_household_id)
    and public.user_can_access_import_batch(target_import_batch_id, target_user_id)
    and (
      (target_type = 'reimbursement' and public.user_can_reference_reimbursement(target_reimbursement_for_movement_id, target_user_id))
      or (target_type <> 'reimbursement' and target_reimbursement_for_movement_id is null)
    );
$$;

create or replace function public.transfer_row_is_allowed(
  target_owner_user_id uuid,
  target_household_id uuid,
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
    and (target_household_id is null or public.is_active_household_member(target_household_id, target_user_id))
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

create or replace function public.fixed_expense_row_is_allowed(
  target_owner_user_id uuid,
  target_household_id uuid,
  target_shared_with_family boolean,
  target_account_id uuid,
  target_fund_id uuid,
  target_category_id uuid,
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
      (target_shared_with_family = false and target_household_id is null)
      or (
        target_shared_with_family = true
        and public.is_active_household_member(target_household_id, target_user_id)
      )
    )
    and ((target_account_id is not null)::int + (target_fund_id is not null)::int = 1)
    and public.user_can_access_account(target_account_id, target_user_id, target_household_id)
    and public.user_can_access_fund(target_fund_id, target_user_id, target_household_id)
    and public.user_can_access_category(target_category_id, target_user_id, target_household_id);
$$;

create or replace function public.budget_row_is_allowed(
  target_owner_type public.resource_owner_type,
  target_owner_user_id uuid,
  target_household_id uuid,
  target_macro_category_id uuid,
  target_category_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
      target_owner_type = 'USER'
      and target_owner_user_id = target_user_id
      and target_household_id is null
      and (target_macro_category_id is null or exists (
        select 1 from public.macro_categories mc
        where mc.id = target_macro_category_id
          and mc.owner_user_id = target_user_id
      ))
      and (target_category_id is null or exists (
        select 1
        from public.categories c
        join public.macro_categories mc on mc.id = c.macro_category_id
        where c.id = target_category_id
          and mc.owner_user_id = target_user_id
      ))
    )
    or (
      target_owner_type = 'HOUSEHOLD'
      and target_owner_user_id is null
      and public.is_household_admin(target_household_id, target_user_id)
      and (target_macro_category_id is null or exists (
        select 1 from public.macro_categories mc
        where mc.id = target_macro_category_id
          and mc.household_id = target_household_id
      ))
      and (target_category_id is null or exists (
        select 1
        from public.categories c
        join public.macro_categories mc on mc.id = c.macro_category_id
        where c.id = target_category_id
          and mc.household_id = target_household_id
      ))
    );
$$;

revoke all on function public.is_active_household_member(uuid, uuid) from public;
revoke all on function public.is_household_admin(uuid, uuid) from public;
revoke all on function public.user_can_access_account(uuid, uuid, uuid) from public;
revoke all on function public.user_can_access_fund(uuid, uuid, uuid) from public;
revoke all on function public.user_can_access_category(uuid, uuid, uuid) from public;
revoke all on function public.user_can_access_import_batch(uuid, uuid) from public;
revoke all on function public.user_can_reference_reimbursement(uuid, uuid) from public;
revoke all on function public.movement_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, public.movement_type, uuid, uuid, uuid) from public;
revoke all on function public.transfer_row_is_allowed(uuid, uuid, uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.fixed_expense_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, uuid) from public;
revoke all on function public.budget_row_is_allowed(public.resource_owner_type, uuid, uuid, uuid, uuid, uuid) from public;

grant execute on function public.is_active_household_member(uuid, uuid) to authenticated;
grant execute on function public.is_household_admin(uuid, uuid) to authenticated;
grant execute on function public.user_can_access_account(uuid, uuid, uuid) to authenticated;
grant execute on function public.user_can_access_fund(uuid, uuid, uuid) to authenticated;
grant execute on function public.user_can_access_category(uuid, uuid, uuid) to authenticated;
grant execute on function public.user_can_access_import_batch(uuid, uuid) to authenticated;
grant execute on function public.user_can_reference_reimbursement(uuid, uuid) to authenticated;
grant execute on function public.movement_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, public.movement_type, uuid, uuid, uuid) to authenticated;
grant execute on function public.transfer_row_is_allowed(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.fixed_expense_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.budget_row_is_allowed(public.resource_owner_type, uuid, uuid, uuid, uuid, uuid) to authenticated;
