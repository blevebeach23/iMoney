create table public.movements (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  account_id uuid references public.accounts(id) on delete restrict,
  fund_id uuid references public.funds(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  type public.movement_type not null,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null,
  description text not null default '',
  shared_with_family boolean not null default false,
  reimbursement_for_movement_id uuid references public.movements(id) on delete restrict,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint movements_account_xor_fund check (
    (account_id is not null)::int + (fund_id is not null)::int = 1
  ),
  constraint movements_shared_household_consistency check (
    (shared_with_family = true and household_id is not null)
    or (shared_with_family = false and household_id is null)
  ),
  constraint movements_reimbursement_target check (
    (type = 'reimbursement' and reimbursement_for_movement_id is not null)
    or (type <> 'reimbursement' and reimbursement_for_movement_id is null)
  )
);

create trigger movements_set_updated_at
before update on public.movements
for each row execute function public.set_updated_at();

create index movements_owner_month_idx on public.movements(owner_user_id, occurred_on) where deleted_at is null;
create index movements_household_shared_month_idx
  on public.movements(household_id, shared_with_family, occurred_on)
  where deleted_at is null and shared_with_family = true;
create index movements_account_date_idx on public.movements(account_id, occurred_on) where deleted_at is null and account_id is not null;
create index movements_fund_date_idx on public.movements(fund_id, occurred_on) where deleted_at is null and fund_id is not null;
create index movements_category_date_idx on public.movements(category_id, occurred_on) where deleted_at is null;
create index movements_import_batch_idx on public.movements(import_batch_id) where import_batch_id is not null;
create index movements_reimbursement_target_idx on public.movements(reimbursement_for_movement_id) where reimbursement_for_movement_id is not null;
