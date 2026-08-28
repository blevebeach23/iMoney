alter type public.account_type add value if not exists 'other';

alter table public.funds
add column opening_balance_date date not null default current_date,
add column target_amount numeric(14,2) check (target_amount is null or target_amount >= 0),
add column target_date date;

alter table public.macro_categories
add column deleted_at timestamptz;

alter table public.categories
add column deleted_at timestamptz;

drop index if exists public.macro_categories_owner_name_idx;
drop index if exists public.macro_categories_household_name_idx;
drop index if exists public.categories_macro_name_idx;

create index macro_categories_owner_active_idx
  on public.macro_categories(owner_user_id, sort_order, name)
  where deleted_at is null and owner_user_id is not null;

create index macro_categories_household_active_idx
  on public.macro_categories(household_id, sort_order, name)
  where deleted_at is null and household_id is not null;

create index categories_macro_active_idx
  on public.categories(macro_category_id, sort_order, name)
  where deleted_at is null;

create unique index macro_categories_owner_name_active_idx
  on public.macro_categories(owner_user_id, lower(name))
  where deleted_at is null and owner_user_id is not null;

create unique index macro_categories_household_name_active_idx
  on public.macro_categories(household_id, lower(name))
  where deleted_at is null and household_id is not null;

create unique index categories_macro_name_active_idx
  on public.categories(macro_category_id, lower(name))
  where deleted_at is null;
