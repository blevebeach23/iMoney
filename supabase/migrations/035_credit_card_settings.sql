create table public.credit_card_settings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  settlement_account_id uuid not null references public.accounts(id) on delete restrict,
  statement_closing_day integer not null,
  payment_day integer not null,
  automatic_settlement boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_card_settings_closing_day_valid check (statement_closing_day between 1 and 31),
  constraint credit_card_settings_payment_day_valid check (payment_day between 1 and 31),
  constraint credit_card_settings_distinct_accounts check (account_id <> settlement_account_id)
);

create trigger credit_card_settings_set_updated_at
before update on public.credit_card_settings
for each row execute function public.set_updated_at();

create or replace function public.validate_credit_card_settings_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  card_account public.accounts%rowtype;
  settlement_account public.accounts%rowtype;
begin
  select *
  into card_account
  from public.accounts
  where id = new.account_id
    and deleted_at is null;

  if not found or card_account.type <> 'credit_card' then
    raise exception 'account_id must reference an active credit card account';
  end if;

  select *
  into settlement_account
  from public.accounts
  where id = new.settlement_account_id
    and deleted_at is null;

  if not found or settlement_account.type <> 'bank' then
    raise exception 'settlement_account_id must reference an active bank account';
  end if;

  if card_account.owner_user_id <> settlement_account.owner_user_id then
    raise exception 'credit card and settlement account must have the same owner';
  end if;

  return new;
end;
$$;

create trigger credit_card_settings_validate_row
before insert or update on public.credit_card_settings
for each row execute function public.validate_credit_card_settings_row();

alter table public.credit_card_settings enable row level security;

create policy credit_card_settings_owner_select on public.credit_card_settings
for select using (
  exists (
    select 1
    from public.accounts a
    where a.id = credit_card_settings.account_id
      and a.owner_user_id = auth.uid()
      and a.deleted_at is null
  )
);

create policy credit_card_settings_owner_insert on public.credit_card_settings
for insert with check (
  exists (
    select 1
    from public.accounts card
    join public.accounts bank on bank.id = credit_card_settings.settlement_account_id
    where card.id = credit_card_settings.account_id
      and card.owner_user_id = auth.uid()
      and bank.owner_user_id = auth.uid()
      and card.type = 'credit_card'
      and bank.type = 'bank'
      and card.deleted_at is null
      and bank.deleted_at is null
  )
);

create policy credit_card_settings_owner_update on public.credit_card_settings
for update using (
  exists (
    select 1
    from public.accounts a
    where a.id = credit_card_settings.account_id
      and a.owner_user_id = auth.uid()
      and a.deleted_at is null
  )
) with check (
  exists (
    select 1
    from public.accounts card
    join public.accounts bank on bank.id = credit_card_settings.settlement_account_id
    where card.id = credit_card_settings.account_id
      and card.owner_user_id = auth.uid()
      and bank.owner_user_id = auth.uid()
      and card.type = 'credit_card'
      and bank.type = 'bank'
      and card.deleted_at is null
      and bank.deleted_at is null
  )
);

create policy credit_card_settings_owner_delete on public.credit_card_settings
for delete using (
  exists (
    select 1
    from public.accounts a
    where a.id = credit_card_settings.account_id
      and a.owner_user_id = auth.uid()
      and a.deleted_at is null
  )
);

alter table public.transfers
  add column credit_card_account_id uuid references public.accounts(id) on delete set null,
  add column credit_card_cycle_start_on date,
  add column credit_card_cycle_end_on date,
  add constraint transfers_credit_card_cycle_complete check (
    (credit_card_account_id is null and credit_card_cycle_start_on is null and credit_card_cycle_end_on is null)
    or (credit_card_account_id is not null and credit_card_cycle_start_on is not null and credit_card_cycle_end_on is not null)
  ),
  add constraint transfers_credit_card_cycle_range check (
    credit_card_cycle_start_on is null or credit_card_cycle_end_on >= credit_card_cycle_start_on
  );

create or replace function public.validate_credit_card_settlement_transfer()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  card_account public.accounts%rowtype;
  settlement_account public.accounts%rowtype;
begin
  if new.credit_card_account_id is null then
    return new;
  end if;

  if new.to_account_id is null or new.from_account_id is null or new.from_fund_id is not null or new.to_fund_id is not null then
    raise exception 'credit card settlement transfer must be bank account to credit card account';
  end if;

  if new.credit_card_account_id <> new.to_account_id then
    raise exception 'credit_card_account_id must match transfer destination card';
  end if;

  select *
  into card_account
  from public.accounts
  where id = new.to_account_id
    and deleted_at is null;

  if not found or card_account.type <> 'credit_card' then
    raise exception 'credit card settlement destination must be an active credit card';
  end if;

  select *
  into settlement_account
  from public.accounts
  where id = new.from_account_id
    and deleted_at is null;

  if not found or settlement_account.type <> 'bank' then
    raise exception 'credit card settlement source must be an active bank account';
  end if;

  if card_account.owner_user_id <> settlement_account.owner_user_id or card_account.owner_user_id <> new.owner_user_id then
    raise exception 'credit card settlement transfer accounts must have the same owner';
  end if;

  return new;
end;
$$;

create trigger transfers_validate_credit_card_settlement
before insert or update on public.transfers
for each row execute function public.validate_credit_card_settlement_transfer();

create unique index transfers_credit_card_settlement_cycle_idx
  on public.transfers(owner_user_id, credit_card_account_id, credit_card_cycle_start_on, credit_card_cycle_end_on)
  where deleted_at is null and credit_card_account_id is not null;

create index credit_card_settings_account_idx on public.credit_card_settings(account_id);
create index credit_card_settings_settlement_account_idx on public.credit_card_settings(settlement_account_id);

revoke all on function public.validate_credit_card_settings_row() from public;
revoke all on function public.validate_credit_card_settlement_transfer() from public;
