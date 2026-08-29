alter table public.movements
add column notes text not null default '',
add column created_by uuid references public.profiles(id) on delete set null,
add column updated_by uuid references public.profiles(id) on delete set null;

alter table public.movements
drop constraint movements_reimbursement_target;

alter table public.movements
add constraint movements_reimbursement_target check (
  type = 'reimbursement'
  or (type <> 'reimbursement' and reimbursement_for_movement_id is null)
);

create or replace function public.user_can_access_category(target_category_id uuid, target_user_id uuid, target_household_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_category_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.categories c
      join public.macro_categories mc on mc.id = c.macro_category_id
      where c.id = target_category_id
        and c.deleted_at is null
        and mc.deleted_at is null
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

revoke all on function public.user_can_access_category(uuid, uuid, uuid) from public;
revoke all on function public.movement_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, public.movement_type, uuid, uuid, uuid) from public;
grant execute on function public.user_can_access_category(uuid, uuid, uuid) to authenticated;
grant execute on function public.movement_row_is_allowed(uuid, uuid, boolean, uuid, uuid, uuid, public.movement_type, uuid, uuid, uuid) to authenticated;

create index movements_owner_type_idx
  on public.movements(owner_user_id, type)
  where deleted_at is null;
