create table public.import_account_mappings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  csv_value text not null,
  normalized_value text not null,
  account_id uuid references public.accounts(id) on delete cascade,
  fund_id uuid references public.funds(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_account_mappings_value_not_blank check (length(trim(csv_value)) > 0),
  constraint import_account_mappings_normalized_not_blank check (length(trim(normalized_value)) > 0),
  constraint import_account_mappings_account_xor_fund check (
    (account_id is not null)::int + (fund_id is not null)::int = 1
  )
);

create trigger import_account_mappings_set_updated_at
before update on public.import_account_mappings
for each row execute function public.set_updated_at();

create unique index import_account_mappings_owner_value_idx
  on public.import_account_mappings(owner_user_id, normalized_value);

create index import_account_mappings_account_idx on public.import_account_mappings(account_id);
create index import_account_mappings_fund_idx on public.import_account_mappings(fund_id);

alter table public.import_account_mappings enable row level security;

create policy import_account_mappings_owner_select on public.import_account_mappings
for select using (owner_user_id = auth.uid());

create policy import_account_mappings_owner_insert on public.import_account_mappings
for insert with check (
  owner_user_id = auth.uid()
  and (
    (
      account_id is not null
      and exists (
        select 1
        from public.accounts account
        where account.id = account_id
          and account.owner_user_id = auth.uid()
          and account.deleted_at is null
      )
    )
    or (
      fund_id is not null
      and exists (
        select 1
        from public.funds fund
        where fund.id = fund_id
          and fund.owner_user_id = auth.uid()
          and fund.deleted_at is null
      )
    )
  )
);

create policy import_account_mappings_owner_update on public.import_account_mappings
for update using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and (
    (
      account_id is not null
      and exists (
        select 1
        from public.accounts account
        where account.id = account_id
          and account.owner_user_id = auth.uid()
          and account.deleted_at is null
      )
    )
    or (
      fund_id is not null
      and exists (
        select 1
        from public.funds fund
        where fund.id = fund_id
          and fund.owner_user_id = auth.uid()
          and fund.deleted_at is null
      )
    )
  )
);

alter table public.transfers
  add column if not exists import_batch_id uuid references public.import_batches(id) on delete set null;

create index if not exists transfers_import_batch_idx
  on public.transfers(import_batch_id)
  where import_batch_id is not null;
