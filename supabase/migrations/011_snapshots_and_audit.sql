create table public.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete cascade,
  fund_id uuid references public.funds(id) on delete cascade,
  snapshot_date date not null,
  balance numeric(14,2) not null,
  created_at timestamptz not null default now(),
  constraint balance_snapshots_target_xor check (
    (account_id is not null)::int + (fund_id is not null)::int = 1
  )
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  household_id uuid references public.households(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint audit_log_action_not_blank check (length(trim(action)) > 0)
);

create unique index balance_snapshots_account_date_unique_idx
  on public.balance_snapshots(account_id, snapshot_date)
  where account_id is not null;
create unique index balance_snapshots_fund_date_unique_idx
  on public.balance_snapshots(fund_id, snapshot_date)
  where fund_id is not null;
create index balance_snapshots_owner_idx on public.balance_snapshots(owner_user_id);
create index audit_log_actor_idx on public.audit_log(actor_user_id);
create index audit_log_household_idx on public.audit_log(household_id);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
