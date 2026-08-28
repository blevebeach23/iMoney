create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete restrict,
  fund_id uuid references public.funds(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  description text not null default '',
  frequency public.fixed_expense_frequency not null default 'monthly',
  starts_on date not null,
  ends_on date,
  shared_with_family boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_expenses_account_xor_fund check (
    (account_id is not null)::int + (fund_id is not null)::int = 1
  ),
  constraint fixed_expenses_shared_household_consistency check (
    (shared_with_family = true and household_id is not null)
    or (shared_with_family = false and household_id is null)
  ),
  constraint fixed_expenses_valid_date_range check (ends_on is null or ends_on >= starts_on)
);

create table public.fixed_expense_months (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  month date not null,
  movement_id uuid references public.movements(id) on delete set null,
  skipped_at timestamptz,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fixed_expense_months_month_start check (extract(day from month) = 1),
  constraint fixed_expense_months_single_outcome check (
    (movement_id is not null)::int + (skipped_at is not null)::int <= 1
  )
);

create trigger fixed_expenses_set_updated_at
before update on public.fixed_expenses
for each row execute function public.set_updated_at();

create trigger fixed_expense_months_set_updated_at
before update on public.fixed_expense_months
for each row execute function public.set_updated_at();

create index fixed_expenses_owner_idx on public.fixed_expenses(owner_user_id) where deleted_at is null;
create index fixed_expenses_household_idx on public.fixed_expenses(household_id) where deleted_at is null and shared_with_family = true;
create index fixed_expenses_account_idx on public.fixed_expenses(account_id) where deleted_at is null and account_id is not null;
create index fixed_expenses_fund_idx on public.fixed_expenses(fund_id) where deleted_at is null and fund_id is not null;
create index fixed_expenses_category_idx on public.fixed_expenses(category_id) where deleted_at is null;
create unique index fixed_expense_months_unique_idx on public.fixed_expense_months(fixed_expense_id, month);
create index fixed_expense_months_movement_idx on public.fixed_expense_months(movement_id) where movement_id is not null;
