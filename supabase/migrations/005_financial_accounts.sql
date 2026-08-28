create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type public.account_type not null,
  opening_balance numeric(14,2) not null default 0,
  cached_balance numeric(14,2) not null default 0,
  cached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_name_not_blank check (length(trim(name)) > 0)
);

create table public.funds (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  type public.fund_type not null default 'custom',
  opening_balance numeric(14,2) not null default 0,
  cached_balance numeric(14,2) not null default 0,
  cached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funds_name_not_blank check (length(trim(name)) > 0)
);

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger funds_set_updated_at
before update on public.funds
for each row execute function public.set_updated_at();

create index accounts_owner_idx on public.accounts(owner_user_id) where deleted_at is null;
create index funds_owner_idx on public.funds(owner_user_id) where deleted_at is null;
create unique index accounts_owner_name_active_idx
  on public.accounts(owner_user_id, lower(name))
  where deleted_at is null;
create unique index funds_owner_name_active_idx
  on public.funds(owner_user_id, lower(name))
  where deleted_at is null;
