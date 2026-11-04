-- Scope is mandatory; availability in selectors is separate. Existing recurring
-- rules and accounting history may legitimately refer to archived categories.
-- Do not stop financial synchronization merely because a category was archived.
create or replace function public.guard_accounting_category_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_household uuid; v_category uuid;
begin
 if tg_table_name='budgets' then
   v_owner:=new.owner_user_id; v_household:=new.household_id; v_category:=new.category_id;
   if new.macro_category_id is not null and not exists(select 1 from public.macro_categories mc
     where mc.id=new.macro_category_id and mc.owner_user_id is not distinct from v_owner and mc.household_id is not distinct from v_household) then
     raise exception 'Budget taxonomy does not match its scope' using errcode='23514';
   end if;
 else
   v_category:=new.category_id;
   if new.shared_with_family then v_household:=new.household_id;
   elsif tg_table_name in ('movement_requests','fixed_expense_requests') then v_owner:=new.recipient_user_id;
   else v_owner:=new.owner_user_id; end if;
 end if;
 if v_category is not null and not public.category_matches_scope(v_category,v_owner,v_household) then
   raise exception 'Category taxonomy does not match personal/household scope' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.category_matches_scope(uuid,uuid,uuid) from public,anon,authenticated,service_role;
