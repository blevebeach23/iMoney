create or replace function public.deactivate_category(target_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.categories c
  set deleted_at = now(),
      updated_at = now()
  from public.macro_categories mc
  where c.id = target_category_id
    and c.macro_category_id = mc.id
    and c.deleted_at is null
    and (
      mc.owner_user_id = auth.uid()
      or public.is_household_admin(mc.household_id, auth.uid())
    );

  if not found then
    raise exception 'Category not found or not allowed'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.deactivate_category(uuid) from public;
grant execute on function public.deactivate_category(uuid) to authenticated;
