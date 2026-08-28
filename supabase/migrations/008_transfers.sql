create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  from_account_id uuid references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  from_fund_id uuid references public.funds(id) on delete restrict,
  to_fund_id uuid references public.funds(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  description text not null default '',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transfers_source_xor check (
    (from_account_id is not null)::int + (from_fund_id is not null)::int = 1
  ),
  constraint transfers_destination_xor check (
    (to_account_id is not null)::int + (to_fund_id is not null)::int = 1
  ),
  constraint transfers_no_same_account check (
    from_account_id is null or to_account_id is null or from_account_id <> to_account_id
  ),
  constraint transfers_no_same_fund check (
    from_fund_id is null or to_fund_id is null or from_fund_id <> to_fund_id
  )
);

create trigger transfers_set_updated_at
before update on public.transfers
for each row execute function public.set_updated_at();

create index transfers_owner_month_idx on public.transfers(owner_user_id, occurred_on) where deleted_at is null;
create index transfers_household_month_idx on public.transfers(household_id, occurred_on) where deleted_at is null and household_id is not null;
create index transfers_from_account_idx on public.transfers(from_account_id) where deleted_at is null and from_account_id is not null;
create index transfers_to_account_idx on public.transfers(to_account_id) where deleted_at is null and to_account_id is not null;
create index transfers_from_fund_idx on public.transfers(from_fund_id) where deleted_at is null and from_fund_id is not null;
create index transfers_to_fund_idx on public.transfers(to_fund_id) where deleted_at is null and to_fund_id is not null;
