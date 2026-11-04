create or replace function public.category_matches_scope(p_category uuid,p_owner uuid,p_household uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.categories c join public.macro_categories mc on mc.id=c.macro_category_id
    where c.id=p_category and mc.owner_user_id is not distinct from p_owner and mc.household_id is not distinct from p_household);
$$;
revoke all on function public.category_matches_scope(uuid,uuid,uuid) from public,anon;
grant execute on function public.category_matches_scope(uuid,uuid,uuid) to authenticated,service_role;

create or replace function public.user_can_access_category(target_category_id uuid,target_user_id uuid,target_household_id uuid default null)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select case when target_household_id is null then public.category_matches_scope(target_category_id,target_user_id,null)
 else public.is_active_household_member(target_household_id,target_user_id)
   and public.category_matches_scope(target_category_id,null,target_household_id) end;
$$;

-- Historical/archived labels stay readable in their own scope; selectors filter active rows.
drop policy if exists categories_select_accessible on public.categories;
create policy categories_select_accessible on public.categories for select using (
 exists(select 1 from public.macro_categories mc where mc.id=macro_category_id
   and (mc.owner_user_id=auth.uid() or public.is_active_household_member(mc.household_id,auth.uid())))
);
drop policy if exists categories_update_accessible on public.categories;
create policy categories_update_accessible on public.categories for update using (
 exists(select 1 from public.macro_categories mc where mc.id=macro_category_id
   and (mc.owner_user_id=auth.uid() or public.is_household_admin(mc.household_id,auth.uid())))
) with check (
 exists(select 1 from public.macro_categories mc where mc.id=macro_category_id and mc.deleted_at is null
   and (mc.owner_user_id=auth.uid() or public.is_household_admin(mc.household_id,auth.uid())))
);

create or replace function public.guard_category_ownership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare old_scope record; new_scope record;
begin
 if tg_table_name='macro_categories' then
   if (new.owner_user_id,new.household_id) is distinct from (old.owner_user_id,old.household_id) then
     raise exception 'Category taxonomy ownership is immutable' using errcode='23514';
   end if;
 elsif new.macro_category_id<>old.macro_category_id then
   select owner_user_id,household_id into old_scope from public.macro_categories where id=old.macro_category_id;
   select owner_user_id,household_id into new_scope from public.macro_categories where id=new.macro_category_id;
   if (old_scope.owner_user_id,old_scope.household_id) is distinct from (new_scope.owner_user_id,new_scope.household_id) then
     raise exception 'Cannot move a category across taxonomies' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_category_ownership() from public,anon,authenticated;
drop trigger if exists macro_categories_guard_ownership on public.macro_categories;
create trigger macro_categories_guard_ownership before update on public.macro_categories for each row execute function public.guard_category_ownership();
drop trigger if exists categories_guard_ownership on public.categories;
create trigger categories_guard_ownership before update on public.categories for each row execute function public.guard_category_ownership();

-- Enforce even for SECURITY DEFINER writers, cron and service-role imports.
create or replace function public.guard_accounting_category_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid; v_household uuid; v_category uuid; v_check_active boolean;
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
 if v_category is not null then
   if not public.category_matches_scope(v_category,v_owner,v_household) then
     raise exception 'Category taxonomy does not match personal/household scope' using errcode='23514';
   end if;
   v_check_active:=tg_op='INSERT';
   if tg_op='UPDATE' then v_check_active:=new.category_id is distinct from old.category_id; end if;
   if v_check_active and not exists(select 1 from public.categories c join public.macro_categories mc on mc.id=c.macro_category_id
     where c.id=v_category and c.deleted_at is null and mc.deleted_at is null) then
     raise exception 'Category is inactive' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
revoke all on function public.guard_accounting_category_scope() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['movements','fixed_expenses','movement_requests','fixed_expense_requests','budgets'] loop
   execute format('drop trigger if exists %I on public.%I',t||'_category_scope',t);
   execute format('create trigger %I before insert or update on public.%I for each row execute function public.guard_accounting_category_scope()',t||'_category_scope',t);
 end loop;
end $$;

-- Reference checks are exact, include soft-deleted rows and cannot be truncated
-- by PostgREST max_rows or hidden by row-level access to someone else's budgets.
create or replace function public.get_category_deletion_info(target_category_ids uuid[],target_macro_ids uuid[])
returns table(kind text,id uuid,reasons text[]) language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r record; why text[];
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 for r in select c.id from public.categories c join public.macro_categories mc on mc.id=c.macro_category_id
   where c.id=any(target_category_ids) and (mc.owner_user_id=auth.uid() or public.is_active_household_member(mc.household_id,auth.uid())) loop
   why:='{}';
   if exists(select 1 from public.movements where category_id=r.id) then why:=array_append(why,'movimenti'); end if;
   if exists(select 1 from public.fixed_expenses where category_id=r.id) then why:=array_append(why,'ricorrenze'); end if;
   if exists(select 1 from public.budgets where category_id=r.id) then why:=array_append(why,'budget'); end if;
   if exists(select 1 from public.movement_requests where category_id=r.id) then why:=array_append(why,'richieste movimenti'); end if;
   if exists(select 1 from public.fixed_expense_requests where category_id=r.id) then why:=array_append(why,'richieste ricorrenze'); end if;
   kind:='category'; id:=r.id; reasons:=why; return next;
 end loop;
 for r in select mc.id from public.macro_categories mc where mc.id=any(target_macro_ids)
   and (mc.owner_user_id=auth.uid() or public.is_active_household_member(mc.household_id,auth.uid())) loop
   why:='{}';
   if exists(select 1 from public.categories where macro_category_id=r.id) then why:=array_append(why,'categorie figlie'); end if;
   if exists(select 1 from public.budgets where macro_category_id=r.id) then why:=array_append(why,'budget'); end if;
   kind:='macro'; id:=r.id; reasons:=why; return next;
 end loop;
end $$;
revoke all on function public.get_category_deletion_info(uuid[],uuid[]) from public,anon;
grant execute on function public.get_category_deletion_info(uuid[],uuid[]) to authenticated;

-- Requests have ON DELETE SET NULL, so also guard direct privileged deletes.
create or replace function public.guard_referenced_category_delete()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_table_name='categories' then
   if exists(select 1 from public.movements where category_id=old.id)
    or exists(select 1 from public.fixed_expenses where category_id=old.id)
    or exists(select 1 from public.budgets where category_id=old.id)
    or exists(select 1 from public.movement_requests where category_id=old.id)
    or exists(select 1 from public.fixed_expense_requests where category_id=old.id) then
      raise exception 'Categoria referenziata: eliminazione non consentita' using errcode='23503';
   end if;
 elsif exists(select 1 from public.categories where macro_category_id=old.id)
   or exists(select 1 from public.budgets where macro_category_id=old.id) then
   raise exception 'Macro-categoria referenziata: eliminazione non consentita' using errcode='23503';
 end if;
 return old;
end $$;
revoke all on function public.guard_referenced_category_delete() from public,anon,authenticated;
drop trigger if exists categories_guard_delete on public.categories;
create trigger categories_guard_delete before delete on public.categories for each row execute function public.guard_referenced_category_delete();
drop trigger if exists macro_categories_guard_delete on public.macro_categories;
create trigger macro_categories_guard_delete before delete on public.macro_categories for each row execute function public.guard_referenced_category_delete();
