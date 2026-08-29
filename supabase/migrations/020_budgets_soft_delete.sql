alter table public.budgets
add column if not exists deleted_at timestamptz;

drop index if exists public.budgets_user_general_unique_idx;
drop index if exists public.budgets_user_macro_unique_idx;
drop index if exists public.budgets_user_category_unique_idx;
drop index if exists public.budgets_household_general_unique_idx;
drop index if exists public.budgets_household_macro_unique_idx;
drop index if exists public.budgets_household_category_unique_idx;

create unique index budgets_user_general_unique_idx
  on public.budgets(owner_user_id, month)
  where owner_type = 'USER' and macro_category_id is null and category_id is null and deleted_at is null;
create unique index budgets_user_macro_unique_idx
  on public.budgets(owner_user_id, month, macro_category_id)
  where owner_type = 'USER' and macro_category_id is not null and deleted_at is null;
create unique index budgets_user_category_unique_idx
  on public.budgets(owner_user_id, month, category_id)
  where owner_type = 'USER' and category_id is not null and deleted_at is null;
create unique index budgets_household_general_unique_idx
  on public.budgets(household_id, month)
  where owner_type = 'HOUSEHOLD' and macro_category_id is null and category_id is null and deleted_at is null;
create unique index budgets_household_macro_unique_idx
  on public.budgets(household_id, month, macro_category_id)
  where owner_type = 'HOUSEHOLD' and macro_category_id is not null and deleted_at is null;
create unique index budgets_household_category_unique_idx
  on public.budgets(household_id, month, category_id)
  where owner_type = 'HOUSEHOLD' and category_id is not null and deleted_at is null;

create index if not exists budgets_user_active_month_idx
  on public.budgets(owner_user_id, month)
  where owner_type = 'USER' and deleted_at is null;
