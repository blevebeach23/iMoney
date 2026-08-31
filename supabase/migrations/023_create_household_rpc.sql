create or replace function public.create_household(household_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_household_id uuid;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  normalized_name := trim(household_name);

  if normalized_name is null or length(normalized_name) = 0 or length(normalized_name) > 80 then
    raise exception 'Invalid household name';
  end if;

  insert into public.households (name, created_by)
  values (normalized_name, auth.uid())
  returning id into new_household_id;

  insert into public.household_members (
    household_id,
    user_id,
    role,
    status,
    joined_at
  )
  values (
    new_household_id,
    auth.uid(),
    'owner',
    'ACTIVE',
    now()
  );

  insert into public.household_user_preferences (household_id, user_id, preferences)
  values (new_household_id, auth.uid(), jsonb_build_object('share_new_movements_by_default', false));

  return new_household_id;
end;
$$;

revoke all on function public.create_household(text) from public;
grant execute on function public.create_household(text) to authenticated;
