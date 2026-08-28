-- The original category INSERT/UPDATE policies query macro_categories directly.
-- Under RLS, that can prevent authenticated clients from adding categories
-- immediately after creating an accessible macro category. Use a narrowly
-- scoped SECURITY DEFINER helper for the ownership/admin check.
create or replace function public.user_can_manage_macro_category(target_macro_category_id uuid, target_user_id uuid)
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
        and (
          mc.owner_user_id = target_user_id
          or public.is_household_admin(mc.household_id, target_user_id)
        )
    );
$$;

revoke all on function public.user_can_manage_macro_category(uuid, uuid) from public;
grant execute on function public.user_can_manage_macro_category(uuid, uuid) to authenticated;

drop policy categories_insert_accessible on public.categories;
create policy categories_insert_accessible on public.categories
for insert with check (public.user_can_manage_macro_category(macro_category_id, auth.uid()));

drop policy categories_update_accessible on public.categories;
create policy categories_update_accessible on public.categories
for update using (public.user_can_access_category(id, auth.uid(), null))
with check (public.user_can_manage_macro_category(macro_category_id, auth.uid()));
