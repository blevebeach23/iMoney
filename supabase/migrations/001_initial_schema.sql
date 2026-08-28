create extension if not exists pgcrypto;

create type movement_type as enum ('income', 'expense', 'reimbursement');
create type account_type as enum ('cash', 'bank', 'credit_card');
create type fund_type as enum ('savings', 'holiday', 'emergency', 'deposit', 'custom');
create type household_role as enum ('owner', 'member');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  full_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role household_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.macro_categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint macro_categories_owner_or_household check (owner_user_id is not null or household_id is not null)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  macro_category_id uuid not null references public.macro_categories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type account_type not null,
  opening_balance numeric(14,2) not null default 0,
  cached_balance numeric(14,2) not null default 0,
  cached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type fund_type not null default 'custom',
  opening_balance numeric(14,2) not null default 0,
  cached_balance numeric(14,2) not null default 0,
  cached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  source_filename text not null,
  imported_rows integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  fund_id uuid references public.funds(id) on delete set null,
  category_id uuid references public.categories(id) on delete restrict,
  type movement_type not null,
  amount numeric(14,2) not null check (amount >= 0),
  occurred_on date not null,
  description text not null default '',
  is_shared_with_household boolean not null default false,
  reimbursement_for_movement_id uuid references public.movements(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movements_account_or_fund check (account_id is not null or fund_id is not null),
  constraint movements_shared_requires_household check (
    is_shared_with_household = false or household_id is not null
  )
);

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  from_account_id uuid references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  from_fund_id uuid references public.funds(id) on delete restrict,
  to_fund_id uuid references public.funds(id) on delete restrict,
  amount numeric(14,2) not null check (amount >= 0),
  occurred_on date not null,
  description text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_has_source check (from_account_id is not null or from_fund_id is not null),
  constraint transfers_has_destination check (to_account_id is not null or to_fund_id is not null)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  month date not null,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint budgets_month_start check (extract(day from month) = 1),
  constraint budgets_unique_personal unique (owner_user_id, month),
  constraint budgets_shared_requires_household check (household_id is null or owner_user_id is not null)
);

create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  fund_id uuid references public.funds(id) on delete cascade,
  snapshot_date date not null,
  balance numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint balance_snapshots_target check ((account_id is not null)::int + (fund_id is not null)::int = 1),
  constraint balance_snapshots_month_end unique (owner_user_id, account_id, fund_id, snapshot_date)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index movements_owner_month_idx on public.movements(owner_user_id, occurred_on) where deleted_at is null;
create index movements_household_month_idx on public.movements(household_id, occurred_on) where deleted_at is null and is_shared_with_household = true;
create index transfers_owner_month_idx on public.transfers(owner_user_id, occurred_on) where deleted_at is null;
create index accounts_owner_idx on public.accounts(owner_user_id) where deleted_at is null;
create index funds_owner_idx on public.funds(owner_user_id) where deleted_at is null;

create or replace function public.is_household_member(target_household_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = target_user_id
  );
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.macro_categories enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.funds enable row level security;
alter table public.import_batches enable row level security;
alter table public.movements enable row level security;
alter table public.transfers enable row level security;
alter table public.budgets enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.audit_log enable row level security;

create policy "profiles_select_own" on public.profiles for select using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy "households_member_select" on public.households for select using (public.is_household_member(id, auth.uid()));
create policy "households_insert_owner" on public.households for insert with check (created_by = auth.uid());
create policy "households_update_owner" on public.households for update using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "household_members_visible_to_members" on public.household_members for select using (public.is_household_member(household_id, auth.uid()));
create policy "household_members_insert_self_or_creator" on public.household_members for insert with check (user_id = auth.uid());

create policy "macro_categories_personal_or_household_select" on public.macro_categories for select using (
  owner_user_id = auth.uid() or public.is_household_member(household_id, auth.uid())
);
create policy "macro_categories_owner_write" on public.macro_categories for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "categories_visible_through_macro" on public.categories for select using (
  exists (
    select 1 from public.macro_categories mc
    where mc.id = categories.macro_category_id
      and (mc.owner_user_id = auth.uid() or public.is_household_member(mc.household_id, auth.uid()))
  )
);

create policy "accounts_owner_all" on public.accounts for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "funds_owner_all" on public.funds for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "import_batches_owner_all" on public.import_batches for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "movements_owner_or_shared_select" on public.movements for select using (
  owner_user_id = auth.uid()
  or (is_shared_with_household = true and public.is_household_member(household_id, auth.uid()))
);
create policy "movements_owner_insert" on public.movements for insert with check (owner_user_id = auth.uid());
create policy "movements_owner_update" on public.movements for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "transfers_owner_select" on public.transfers for select using (owner_user_id = auth.uid());
create policy "transfers_owner_insert" on public.transfers for insert with check (owner_user_id = auth.uid());
create policy "transfers_owner_update" on public.transfers for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "budgets_owner_or_household_select" on public.budgets for select using (
  owner_user_id = auth.uid() or public.is_household_member(household_id, auth.uid())
);
create policy "budgets_owner_all" on public.budgets for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy "balance_snapshots_owner_all" on public.balance_snapshots for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy "audit_log_actor_select" on public.audit_log for select using (actor_user_id = auth.uid());

