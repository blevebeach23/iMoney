create function public.financial_today()
returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'Europe/Rome')::date;
$$;

-- The ledger survives detachment, date changes and soft deletion of a booked row.
create table public.recurring_occurrences (
  kind text not null check (kind in ('movement', 'transfer')),
  rule_id uuid not null,
  scheduled_on date not null,
  owner_user_id uuid not null references public.profiles(id),
  resource_id uuid not null,
  booked_on date,
  cancelled_at timestamptz,
  primary key (kind, rule_id, scheduled_on),
  unique (kind, resource_id)
);
alter table public.recurring_occurrences enable row level security;
-- Internal bookkeeping is private even when the accounting row is shared.
create policy recurring_occurrences_owner_select on public.recurring_occurrences
  for select using (owner_user_id = auth.uid());
revoke insert, update, delete on public.recurring_occurrences from anon, authenticated;

insert into public.recurring_occurrences
  (kind, rule_id, scheduled_on, owner_user_id, resource_id, booked_on, cancelled_at)
select distinct on (fixed_expense_id, occurred_on)
  'movement', fixed_expense_id, occurred_on, owner_user_id, id,
  case when occurred_on <= public.financial_today() then occurred_on end, deleted_at
from public.movements where fixed_expense_id is not null
order by fixed_expense_id, occurred_on, (deleted_at is null) desc, created_at, id;
insert into public.recurring_occurrences
  (kind, rule_id, scheduled_on, owner_user_id, resource_id, booked_on, cancelled_at)
select distinct on (recurring_transfer_id, occurred_on)
  'transfer', recurring_transfer_id, occurred_on, owner_user_id, id,
  case when occurred_on <= public.financial_today() then occurred_on end, deleted_at
from public.transfers where recurring_transfer_id is not null
order by recurring_transfer_id, occurred_on, (deleted_at is null) desc, created_at, id;

-- Preserve explicit historical skips, including months whose movement reference was lost.
insert into public.recurring_occurrences
  (kind, rule_id, scheduled_on, owner_user_id, resource_id, booked_on, cancelled_at)
select 'movement', f.id,
  (fm.month + (least(f.day_of_month, extract(day from (fm.month + interval '1 month - 1 day'))::int) - 1))::date,
  f.owner_user_id, coalesce(fm.movement_id, fm.id), fm.month, coalesce(fm.skipped_at, fm.generated_at)
from public.fixed_expense_months fm join public.fixed_expenses f on f.id = fm.fixed_expense_id
where fm.skipped_at is not null or (fm.generated_at is not null and fm.movement_id is null)
on conflict do nothing;

create function public.track_recurring_occurrence()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text := case when tg_table_name = 'movements' then 'movement' else 'transfer' end;
  v_rule uuid;
  v_entry public.recurring_occurrences%rowtype;
  v_today date := public.financial_today();
begin
  if tg_table_name = 'movements' then v_rule := new.fixed_expense_id;
  else v_rule := new.recurring_transfer_id; end if;

  select * into v_entry from public.recurring_occurrences
    where kind = v_kind and resource_id = new.id for update;
  if not found and v_rule is not null then
    -- A rule reference may only point to the row owner's rule, never a family member's.
    if v_kind = 'movement' then
      if not exists (select 1 from public.fixed_expenses where id = v_rule and owner_user_id = new.owner_user_id) then
        raise exception 'Invalid recurring movement owner';
      end if;
    else
      if not exists (select 1 from public.recurring_transfers where id = v_rule and owner_user_id = new.owner_user_id) then
        raise exception 'Invalid recurring transfer owner';
      end if;
    end if;
    insert into public.recurring_occurrences(kind, rule_id, scheduled_on, owner_user_id, resource_id)
      values (v_kind, v_rule, new.occurred_on, new.owner_user_id, new.id)
      on conflict do nothing;
    select * into v_entry from public.recurring_occurrences
      where kind = v_kind and rule_id = v_rule and scheduled_on = new.occurred_on for update;
    if v_entry.resource_id <> new.id then
      -- A cancelled future projection may be replaced after a rule edit; a booked
      -- occurrence (including a deleted one) must NEVER be generated again.
      if tg_op = 'INSERT' then
        if v_entry.booked_on is not null or v_entry.scheduled_on <= v_today or v_entry.cancelled_at is null then return null; end if;
        update public.recurring_occurrences set resource_id = new.id, cancelled_at = null
          where kind = v_kind and rule_id = v_rule and scheduled_on = new.occurred_on;
      else
        -- Preserve legacy duplicate rows without rewriting their ledger identity.
        if new.occurred_on <= v_today then
          if v_kind = 'movement' then new.fixed_expense_id := null; else new.recurring_transfer_id := null; end if;
        end if;
        return new;
      end if;
    end if;
  elsif not found then
    return new;
  end if;

  if v_entry.owner_user_id <> new.owner_user_id then raise exception 'Occurrence owner is immutable'; end if;
  update public.recurring_occurrences
    set booked_on = coalesce(booked_on, case when scheduled_on <= v_today and cancelled_at is null then scheduled_on end),
        cancelled_at = new.deleted_at
    where kind = v_kind and resource_id = new.id returning * into v_entry;
  if v_entry.booked_on is not null then
    if v_kind = 'movement' then new.fixed_expense_id := null; else new.recurring_transfer_id := null; end if;
  end if;
  return new;
end $$;
create trigger movements_track_occurrence before insert or update on public.movements
  for each row execute function public.track_recurring_occurrence();
create trigger transfers_track_occurrence before insert or update on public.transfers
  for each row execute function public.track_recurring_occurrence();
revoke all on function public.track_recurring_occurrence() from public;

update public.movements set fixed_expense_id = null
  where fixed_expense_id is not null and occurred_on <= public.financial_today();
update public.transfers set recurring_transfer_id = null
  where recurring_transfer_id is not null and occurred_on <= public.financial_today();

-- Also protect card settlement identity after soft deletion and across concurrent
-- inserts. Match by closing date to recognize pre-migration calendar-month cycles.
create function public.guard_settlement_identity()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if old.credit_card_account_id is not null and
      (new.credit_card_account_id, new.credit_card_cycle_start_on, new.credit_card_cycle_end_on)
      is distinct from (old.credit_card_account_id, old.credit_card_cycle_start_on, old.credit_card_cycle_end_on) then
      raise exception 'Settlement cycle identity is immutable';
    end if;
    return new;
  end if;
  if new.credit_card_account_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.credit_card_account_id::text || new.credit_card_cycle_end_on::text, 0));
  if exists (select 1 from public.transfers where owner_user_id = new.owner_user_id
    and credit_card_account_id = new.credit_card_account_id
    and credit_card_cycle_end_on = new.credit_card_cycle_end_on) then return null; end if;
  return new;
end $$;
create trigger transfers_guard_settlement_identity before insert or update on public.transfers
  for each row execute function public.guard_settlement_identity();
revoke all on function public.guard_settlement_identity() from public;

-- Snapshots remain historical records, but a backdated write invalidates every
-- later cached snapshot. Future readers must require invalidated_at IS NULL.
alter table public.balance_snapshots add column invalidated_at timestamptz;
create function public.invalidate_accounting_snapshots()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_from date := new.occurred_on;
begin
  if tg_op = 'UPDATE' then v_from := least(old.occurred_on, new.occurred_on); end if;
  update public.balance_snapshots set invalidated_at = now()
    where owner_user_id = new.owner_user_id and snapshot_date >= v_from and invalidated_at is null;
  return new;
end $$;
create trigger movements_invalidate_snapshots after insert or update on public.movements
  for each row execute function public.invalidate_accounting_snapshots();
create trigger transfers_invalidate_snapshots after insert or update on public.transfers
  for each row execute function public.invalidate_accounting_snapshots();
revoke all on function public.invalidate_accounting_snapshots() from public;
