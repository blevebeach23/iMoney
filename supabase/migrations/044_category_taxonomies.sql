-- Scope is inherited from macro_categories' existing owner XOR household.
-- No runtime personal/family mapping and no accounting rows are recreated.
create or replace function public.category_default_taxonomy()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
select '[
 {"macro":"ALIMENTARI","categories":["Colazione","Pranzo","Cena","Dolci","Supermercato"]},
 {"macro":"PROFESSIONE","categories":["Attività Professionale","Negozio","Stipendio"]},
 {"macro":"CASA","categories":["Affitto","Mutuo","Manutenzione"]},
 {"macro":"AUTO","categories":["Carburante","Assicurazione","Manutenzione"]},
 {"macro":"ISTRUZIONE","categories":["Mensa","Pulmino","Asilo","Scuola","Libri","Attività","Corsi"]},
 {"macro":"UTENZE","categories":["Luce","Gas","Telefono"]},
 {"macro":"TASSE","categories":["Tributi e Tasse","Bolli","Multe"]},
 {"macro":"SALUTE","categories":["Farmacia","Visite"]},
 {"macro":"TEMPO LIBERO","categories":["Ristoranti e locali","Shopping","Hobby","Svago","Cultura","Sport"]},
 {"macro":"REGALI","categories":["Buste Cerimonie","Regali Compleanni"]},
 {"macro":"FESTE","categories":["Cerimonie","Compleanni","Regali Privati"]},
 {"macro":"ENTRATE EXTRA","categories":["Regali","Locazioni"]},
 {"macro":"VACANZE","categories":["Viaggi","Alloggi"]},
 {"macro":"ALTRO","categories":["Baby Sitter","Cura della persona","Abbonamenti","Salvadanaio","Attrezzature","Varie"]}
]'::jsonb;
$$;

-- Private seed helper, callable only by migration/trigger/wrapper, never the API.
create or replace function public.seed_category_taxonomy(p_owner uuid, p_household uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare g record; c record; macro_id uuid;
begin
  if (p_owner is null) = (p_household is null) then raise exception 'Exactly one taxonomy owner is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('taxonomy:' || coalesce(p_owner,p_household)::text,0));
  for g in select value, ordinality from jsonb_array_elements(public.category_default_taxonomy()) with ordinality loop
    select id into macro_id from public.macro_categories
      where owner_user_id is not distinct from p_owner and household_id is not distinct from p_household
      and deleted_at is null and lower(trim(name))=lower(g.value->>'macro') order by created_at,id limit 1;
    if not found then
      insert into public.macro_categories(owner_user_id,household_id,name,sort_order)
        values(p_owner,p_household,g.value->>'macro',g.ordinality-1) returning id into macro_id;
    end if;
    for c in select value,ordinality from jsonb_array_elements_text(g.value->'categories') with ordinality loop
      if not exists(select 1 from public.categories where macro_category_id=macro_id and deleted_at is null and lower(trim(name))=lower(c.value)) then
        insert into public.categories(macro_category_id,name,sort_order) values(macro_id,c.value,c.ordinality-1);
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.seed_category_taxonomy(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.initialize_personal_categories()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform public.seed_category_taxonomy(auth.uid(),null);
end $$;
revoke all on function public.initialize_personal_categories() from public,anon;
grant execute on function public.initialize_personal_categories() to authenticated;

create or replace function public.initialize_household_categories()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.seed_category_taxonomy(null,new.id);
  return new;
end $$;
revoke all on function public.initialize_household_categories() from public,anon,authenticated;
drop trigger if exists households_initialize_categories on public.households;
create trigger households_initialize_categories after insert on public.households
  for each row execute function public.initialize_household_categories();

do $$ declare h record; begin
  for h in select id from public.households loop perform public.seed_category_taxonomy(null,h.id); end loop;
end $$;

-- One-time helper; removed below. Reuse only exact trim/case matches in scope.
create function public.migrate_category_to_scope(p_source uuid,p_owner uuid,p_household uuid)
returns uuid language plpgsql set search_path=public,pg_temp as $$
declare source record; macro_id uuid; category_id uuid;
begin
  select c.name,c.sort_order,mc.name as macro_name,mc.sort_order as macro_order,mc.owner_user_id,mc.household_id
    into strict source from public.categories c join public.macro_categories mc on mc.id=c.macro_category_id where c.id=p_source;
  if source.owner_user_id is not distinct from p_owner and source.household_id is not distinct from p_household then return p_source; end if;
  select id into macro_id from public.macro_categories where owner_user_id is not distinct from p_owner
    and household_id is not distinct from p_household and deleted_at is null and lower(trim(name))=lower(trim(source.macro_name))
    order by created_at,id limit 1;
  if not found then
    insert into public.macro_categories(owner_user_id,household_id,name,sort_order)
      values(p_owner,p_household,trim(source.macro_name),source.macro_order) returning id into macro_id;
  end if;
  select id into category_id from public.categories where macro_category_id=macro_id and deleted_at is null
    and lower(trim(name))=lower(trim(source.name)) order by created_at,id limit 1;
  if not found then
    insert into public.categories(macro_category_id,name,sort_order) values(macro_id,trim(source.name),source.sort_order) returning id into category_id;
  end if;
  return category_id;
end $$;

create temporary table category_scope_relinks on commit drop as
with refs as (
 select category_id,case when shared_with_family then null else owner_user_id end as target_owner,
   case when shared_with_family then household_id end as target_household from public.movements
 union select category_id,case when shared_with_family then null else owner_user_id end,
   case when shared_with_family then household_id end from public.fixed_expenses
 union select category_id,case when shared_with_family then null else recipient_user_id end,
   case when shared_with_family then household_id end from public.movement_requests where category_id is not null
 union select category_id,case when shared_with_family then null else recipient_user_id end,
   case when shared_with_family then household_id end from public.fixed_expense_requests where category_id is not null
 union select category_id,owner_user_id,household_id from public.budgets where category_id is not null
)
select *,public.migrate_category_to_scope(category_id,target_owner,target_household) as new_category_id from refs;

-- Category-only migration must not touch lifecycle, snapshots, authors or timestamps.
-- These DDL locks are transactional: any error rolls back all trigger changes.
alter table public.movements disable trigger user;
alter table public.fixed_expenses disable trigger user;
alter table public.movement_requests disable trigger user;
alter table public.fixed_expense_requests disable trigger user;
alter table public.budgets disable trigger user;

do $$ declare tbl text; owner_col text; begin
  foreach tbl in array array['movements','fixed_expenses','movement_requests','fixed_expense_requests'] loop
    owner_col:=case when tbl in ('movements','fixed_expenses') then 'owner_user_id' else 'recipient_user_id' end;
    execute format('update public.%I r set category_id=m.new_category_id from category_scope_relinks m
      where r.category_id=m.category_id and r.category_id<>m.new_category_id
      and m.target_owner is not distinct from case when r.shared_with_family then null else r.%I end
      and m.target_household is not distinct from case when r.shared_with_family then r.household_id end',tbl,owner_col);
  end loop;
end $$;

-- Refuse ambiguous budget convergence; never merge amounts or discard budget rows.
do $$ begin
  if exists(select 1 from public.budgets b join category_scope_relinks m on m.category_id=b.category_id
    and m.target_owner is not distinct from b.owner_user_id and m.target_household is not distinct from b.household_id
    where b.deleted_at is null group by b.owner_type,b.owner_user_id,b.household_id,b.month,m.new_category_id having count(*)>1) then
    raise exception 'Ambiguous duplicate budgets after category migration; review manually';
  end if;
end $$;
update public.budgets b set category_id=m.new_category_id from category_scope_relinks m
  where b.category_id=m.category_id and b.category_id<>m.new_category_id
  and m.target_owner is not distinct from b.owner_user_id and m.target_household is not distinct from b.household_id;

-- Macro-scoped budgets are rare but must obey the same ownership boundary.
do $$ declare v_budget record; target_macro uuid; source_name text; begin
  for v_budget in select b.*,mc.name as macro_name from public.budgets b join public.macro_categories mc on mc.id=b.macro_category_id
    where mc.owner_user_id is distinct from b.owner_user_id or mc.household_id is distinct from b.household_id loop
    source_name:=trim(v_budget.macro_name);
    select id into target_macro from public.macro_categories where owner_user_id is not distinct from v_budget.owner_user_id
      and household_id is not distinct from v_budget.household_id and deleted_at is null and lower(trim(name))=lower(source_name) order by created_at,id limit 1;
    if not found then insert into public.macro_categories(owner_user_id,household_id,name) values(v_budget.owner_user_id,v_budget.household_id,source_name) returning id into target_macro; end if;
    if v_budget.deleted_at is null and exists(select 1 from public.budgets where id<>v_budget.id and deleted_at is null and month=v_budget.month
      and owner_user_id is not distinct from v_budget.owner_user_id and household_id is not distinct from v_budget.household_id and macro_category_id=target_macro) then
      raise exception 'Ambiguous duplicate macro budgets; review manually';
    end if;
    update public.budgets set macro_category_id=target_macro where id=v_budget.id;
  end loop;
end $$;

alter table public.movements enable trigger user;
alter table public.fixed_expenses enable trigger user;
alter table public.movement_requests enable trigger user;
alter table public.fixed_expense_requests enable trigger user;
alter table public.budgets enable trigger user;
drop function public.migrate_category_to_scope(uuid,uuid,uuid);
