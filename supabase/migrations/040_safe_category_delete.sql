create or replace function public.delete_category_if_unused(target_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_category public.categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select c.*
  into target_category
  from public.categories c
  join public.macro_categories mc on mc.id = c.macro_category_id
  where c.id = target_category_id
    and (
      mc.owner_user_id = auth.uid()
      or public.is_household_admin(mc.household_id, auth.uid())
    );

  if not found then
    raise exception 'Categoria non trovata';
  end if;

  if exists (select 1 from public.movements where category_id = target_category_id) then
    raise exception 'Categoria referenziata da movimenti';
  end if;

  if exists (select 1 from public.fixed_expenses where category_id = target_category_id) then
    raise exception 'Categoria referenziata da ricorrenze';
  end if;

  if exists (select 1 from public.budgets where category_id = target_category_id) then
    raise exception 'Categoria referenziata da budget';
  end if;

  if exists (select 1 from public.movement_requests where category_id = target_category_id) then
    raise exception 'Categoria referenziata da richieste movimenti';
  end if;

  if exists (select 1 from public.fixed_expense_requests where category_id = target_category_id) then
    raise exception 'Categoria referenziata da richieste ricorrenze';
  end if;

  delete from public.categories
  where id = target_category_id;
end;
$$;

create or replace function public.delete_macro_category_if_unused(target_macro_category_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_macro public.macro_categories%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select mc.*
  into target_macro
  from public.macro_categories mc
  where mc.id = target_macro_category_id
    and (
      mc.owner_user_id = auth.uid()
      or public.is_household_admin(mc.household_id, auth.uid())
    );

  if not found then
    raise exception 'Macro-categoria non trovata';
  end if;

  if exists (select 1 from public.categories where macro_category_id = target_macro_category_id) then
    raise exception 'Elimina o sposta prima le categorie figlie';
  end if;

  if exists (select 1 from public.budgets where macro_category_id = target_macro_category_id) then
    raise exception 'Macro-categoria referenziata da budget';
  end if;

  delete from public.macro_categories
  where id = target_macro_category_id;
end;
$$;

revoke all on function public.delete_category_if_unused(uuid) from public;
revoke all on function public.delete_macro_category_if_unused(uuid) from public;

grant execute on function public.delete_category_if_unused(uuid) to authenticated;
grant execute on function public.delete_macro_category_if_unused(uuid) to authenticated;
