create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_type public.resource_owner_type not null,
  owner_user_id uuid references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  month date not null,
  macro_category_id uuid references public.macro_categories(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_owner_context check (
    (owner_type = 'USER' and owner_user_id is not null and household_id is null)
    or (owner_type = 'HOUSEHOLD' and owner_user_id is null and household_id is not null)
  ),
  constraint budgets_month_start check (extract(day from month) = 1),
  constraint budgets_scope_category_xor_macro check (
    (macro_category_id is not null)::int + (category_id is not null)::int <= 1
  )
);

create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

create unique index budgets_user_general_unique_idx
  on public.budgets(owner_user_id, month)
  where owner_type = 'USER' and macro_category_id is null and category_id is null;
create unique index budgets_user_macro_unique_idx
  on public.budgets(owner_user_id, month, macro_category_id)
  where owner_type = 'USER' and macro_category_id is not null;
create unique index budgets_user_category_unique_idx
  on public.budgets(owner_user_id, month, category_id)
  where owner_type = 'USER' and category_id is not null;
create unique index budgets_household_general_unique_idx
  on public.budgets(household_id, month)
  where owner_type = 'HOUSEHOLD' and macro_category_id is null and category_id is null;
create unique index budgets_household_macro_unique_idx
  on public.budgets(household_id, month, macro_category_id)
  where owner_type = 'HOUSEHOLD' and macro_category_id is not null;
create unique index budgets_household_category_unique_idx
  on public.budgets(household_id, month, category_id)
  where owner_type = 'HOUSEHOLD' and category_id is not null;
create index budgets_owner_month_idx on public.budgets(owner_type, owner_user_id, household_id, month);
