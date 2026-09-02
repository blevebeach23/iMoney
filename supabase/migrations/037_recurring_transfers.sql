create table public.recurring_transfers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  from_account_id uuid references public.accounts(id) on delete restrict,
  to_account_id uuid references public.accounts(id) on delete restrict,
  from_fund_id uuid references public.funds(id) on delete restrict,
  to_fund_id uuid references public.funds(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  description text not null default '',
  frequency public.fixed_expense_frequency not null default 'monthly',
  starts_on date not null,
  ends_on date,
  day_of_month integer not null default 1 check (day_of_month between 1 and 31),
  is_active boolean not null default true,
  shared_with_family boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_transfers_source_xor check (
    (from_account_id is not null)::int + (from_fund_id is not null)::int = 1
  ),
  constraint recurring_transfers_destination_xor check (
    (to_account_id is not null)::int + (to_fund_id is not null)::int = 1
  ),
  constraint recurring_transfers_no_same_account check (
    from_account_id is null or to_account_id is null or from_account_id <> to_account_id
  ),
  constraint recurring_transfers_no_same_fund check (
    from_fund_id is null or to_fund_id is null or from_fund_id <> to_fund_id
  ),
  constraint recurring_transfers_shared_household_consistency check (
    (shared_with_family = true and household_id is not null)
    or (shared_with_family = false and household_id is null)
  ),
  constraint recurring_transfers_valid_date_range check (ends_on is null or ends_on >= starts_on)
);

alter table public.transfers
  add column if not exists recurring_transfer_id uuid references public.recurring_transfers(id) on delete set null;

create trigger recurring_transfers_set_updated_at
before update on public.recurring_transfers
for each row execute function public.set_updated_at();

create index recurring_transfers_owner_idx on public.recurring_transfers(owner_user_id) where deleted_at is null;
create index recurring_transfers_household_idx on public.recurring_transfers(household_id) where deleted_at is null and shared_with_family = true;
create unique index transfers_recurring_transfer_occurrence_idx
  on public.transfers(owner_user_id, recurring_transfer_id, occurred_on)
  where deleted_at is null and recurring_transfer_id is not null;

alter table public.recurring_transfers enable row level security;

create policy recurring_transfers_owner_or_shared_select on public.recurring_transfers
for select using (
  owner_user_id = auth.uid()
  or (
    shared_with_family = true
    and public.is_active_household_member(household_id, auth.uid())
  )
);

create policy recurring_transfers_insert_owner_valid_refs on public.recurring_transfers
for insert with check (
  public.transfer_row_is_allowed(owner_user_id, household_id, shared_with_family, from_account_id, to_account_id, from_fund_id, to_fund_id, auth.uid())
);

create policy recurring_transfers_update_owner_valid_refs on public.recurring_transfers
for update using (owner_user_id = auth.uid())
with check (
  public.transfer_row_is_allowed(owner_user_id, household_id, shared_with_family, from_account_id, to_account_id, from_fund_id, to_fund_id, auth.uid())
);
