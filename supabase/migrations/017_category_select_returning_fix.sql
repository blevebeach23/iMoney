-- Allow authenticated clients to use insert(...).select() on categories when
-- the parent macro-category is readable by the current user.
create or replace function public.user_can_access_macro_category(target_macro_category_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_macro_category_id is not null
    and target_user_id is not null
    and exists (
      select 1
      from public.macro_categories mc
      where mc.id = target_macro_category_id
        and mc.deleted_at is null
        and (
          mc.owner_user_id = target_user_id
          or public.is_active_household_member(mc.household_id, target_user_id)
        )
    );
$$;

revoke all on function public.user_can_access_macro_category(uuid, uuid) from public;
grant execute on function public.user_can_access_macro_category(uuid, uuid) to authenticated;

drop policy categories_select_accessible on public.categories;
create policy categories_select_accessible on public.categories
for select using (
  deleted_at is null
  and public.user_can_access_macro_category(macro_category_id, auth.uid())
);
