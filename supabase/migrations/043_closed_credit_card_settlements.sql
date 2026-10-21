-- Preserve closed settlement allocation after soft deletion; cache rebuilds
-- and ordinary accounting queries continue to exclude deleted transfers.
-- All automatic posting happens in one transaction per owner. RLS callers can
-- synchronize only themselves; the server cron uses the service role.
create or replace function public.sync_financial_automation(p_owner uuid default auth.uid())
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_today date := public.financial_today();
  v_horizon date := (date_trunc('month', public.financial_today()) + interval '12 months - 1 day')::date;
  r record;
  v_month record;
  v_date date;
  v_previous date;
  v_payment date;
  v_amount numeric(14,2);
  v_count integer := 0;
  v_rows integer;
begin
  if p_owner is null or (auth.role() is distinct from 'service_role' and p_owner is distinct from auth.uid()) then
    raise exception 'Unauthorized financial synchronization' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financial-automation:' || p_owner::text, 0));

  -- Post existing projections first, without taking amounts from a changed rule.
  update public.movements set fixed_expense_id = null
    where owner_user_id = p_owner and fixed_expense_id is not null and occurred_on <= v_today;
  update public.transfers set recurring_transfer_id = null
    where owner_user_id = p_owner and recurring_transfer_id is not null and occurred_on <= v_today;

  for r in select * from public.fixed_expenses where owner_user_id = p_owner and deleted_at is null loop
    if not public.fixed_expense_row_is_allowed(r.owner_user_id, r.household_id, r.shared_with_family,
      r.account_id, r.fund_id, r.category_id, p_owner) then continue; end if;
    for v_month in select d::date as month from generate_series(date_trunc('month', r.starts_on), v_horizon, interval '1 month') d loop
      v_date := (v_month.month + (least(r.day_of_month, extract(day from (v_month.month + interval '1 month - 1 day'))::int) - 1))::date;
      if v_date < r.starts_on or v_date > coalesce(r.ends_on, v_horizon)
        or not (extract(month from v_date)::int = any(r.active_months)) then continue; end if;
      if exists (select 1 from public.recurring_occurrences where kind = 'movement' and rule_id = r.id and scheduled_on = v_date) then continue; end if;
      insert into public.movements(owner_user_id, household_id, account_id, fund_id, category_id, type, amount, occurred_on,
        description, shared_with_family, fixed_expense_id, created_by, updated_by)
      values (p_owner, r.household_id, r.account_id, r.fund_id, r.category_id, 'expense', r.amount, v_date,
        r.description, r.shared_with_family, r.id, p_owner, p_owner);
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end loop;
  end loop;

  for r in select * from public.recurring_transfers where owner_user_id = p_owner and deleted_at is null and is_active loop
    if not public.transfer_row_is_allowed(r.owner_user_id, r.household_id, r.shared_with_family,
      r.from_account_id, r.to_account_id, r.from_fund_id, r.to_fund_id, p_owner) then continue; end if;
    for v_month in select d::date as month from generate_series(date_trunc('month', r.starts_on), v_horizon, interval '1 month') d loop
      v_date := (v_month.month + (least(r.day_of_month, extract(day from (v_month.month + interval '1 month - 1 day'))::int) - 1))::date;
      if v_date < r.starts_on or v_date > coalesce(r.ends_on, v_horizon) then continue; end if;
      if r.frequency = 'quarterly' and (extract(year from age(v_month.month, date_trunc('month', r.starts_on)))::int * 12
        + extract(month from age(v_month.month, date_trunc('month', r.starts_on)))::int) % 3 <> 0 then continue; end if;
      if r.frequency = 'yearly' and extract(month from v_month.month) <> extract(month from r.starts_on) then continue; end if;
      if exists (select 1 from public.recurring_occurrences where kind = 'transfer' and rule_id = r.id and scheduled_on = v_date) then continue; end if;
      insert into public.transfers(owner_user_id, household_id, from_account_id, to_account_id, from_fund_id, to_fund_id,
        amount, occurred_on, description, shared_with_family, recurring_transfer_id)
      values (p_owner, r.household_id, r.from_account_id, r.to_account_id, r.from_fund_id, r.to_fund_id,
        r.amount, v_date, r.description, r.shared_with_family, r.id);
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end loop;
  end loop;

  -- Catch up every unpaid due cycle, not just the month of the latest login.
  for r in select s.*, a.name, a.opening_balance, a.opening_balance_date from public.credit_card_settings s
    join public.accounts a on a.id = s.account_id
    join public.accounts b on b.id = s.settlement_account_id
    where a.owner_user_id = p_owner and b.owner_user_id = p_owner
      and a.deleted_at is null and b.deleted_at is null and s.automatic_settlement loop
    for v_month in select d::date as month from generate_series(
      date_trunc('month', least(r.opening_balance_date, coalesce((select min(occurred_on) from public.movements
        where account_id = r.account_id and deleted_at is null), v_today))), v_today, interval '1 month') d loop
      v_date := (v_month.month + (least(r.statement_closing_day, extract(day from (v_month.month + interval '1 month - 1 day'))::int) - 1))::date;
      v_previous := ((v_month.month - interval '1 month')::date + (least(r.statement_closing_day,
        extract(day from (v_month.month - interval '1 day'))::int) - 1))::date;
      v_payment := (v_month.month + case when r.payment_day < r.statement_closing_day then interval '1 month' else interval '0 months' end)::date;
      v_payment := v_payment + (least(r.payment_day, extract(day from (v_payment + interval '1 month - 1 day'))::int) - 1);
      if v_payment > v_today or v_date > v_today then continue; end if;
      if exists (select 1 from public.transfers where owner_user_id = p_owner and credit_card_account_id = r.account_id
        and credit_card_cycle_end_on = v_date) then continue; end if;
      -- Cumulative recorded purchases minus actual settlements carry refunds
      -- and manual card payments forward without assigning them to a guessed cycle.
      select greatest(0,
        case when r.opening_balance_date <= v_date then r.opening_balance else 0 end
        + coalesce((select sum(case when type = 'expense' then amount else -amount end)
          from public.movements where account_id = r.account_id and deleted_at is null and occurred_on <= v_date), 0)
        + coalesce((select sum(case when from_account_id = r.account_id then amount else -amount end)
          from public.transfers where (from_account_id = r.account_id or to_account_id = r.account_id)
            and deleted_at is null and occurred_on <= v_today), 0)
        -- Retain closed-cycle allocation after soft deletion, without restoring
        -- the deleted transfer's effect on actual account balances.
        - coalesce((select sum(amount) from public.transfers
          where owner_user_id = p_owner and credit_card_account_id = r.account_id
            and credit_card_cycle_end_on <= v_date and deleted_at is not null
            and occurred_on <= v_today), 0)) into v_amount;
      if v_amount <= 0 then continue; end if;
      insert into public.transfers(owner_user_id, from_account_id, to_account_id, amount, occurred_on, description,
        credit_card_account_id, credit_card_cycle_start_on, credit_card_cycle_end_on)
      values (p_owner, r.settlement_account_id, r.account_id, v_amount, v_payment, 'Addebito Carta ' || r.name,
        r.account_id, v_previous + 1, v_date);
      get diagnostics v_rows = row_count;
      v_count := v_count + v_rows;
    end loop;
  end loop;

  -- Rebuild once per batch, from the accounting rows (same signs as balances.ts).
  update public.accounts a set cached_balance = a.opening_balance +
    coalesce((select sum(case when (m.type = 'expense') = (a.type = 'credit_card') then m.amount else -m.amount end)
      from public.movements m where m.account_id = a.id and m.deleted_at is null and m.occurred_on <= v_today), 0) +
    coalesce((select sum(case when (t.to_account_id = a.id) = (a.type <> 'credit_card') then t.amount else -t.amount end)
      from public.transfers t where (t.from_account_id = a.id or t.to_account_id = a.id)
        and t.deleted_at is null and t.occurred_on <= v_today), 0), cached_at = now()
    where a.owner_user_id = p_owner and a.deleted_at is null;
  update public.funds f set cached_balance = f.opening_balance +
    coalesce((select sum(case when m.type = 'expense' then -m.amount else m.amount end)
      from public.movements m where m.fund_id = f.id and m.deleted_at is null and m.occurred_on <= v_today), 0) +
    coalesce((select sum(case when t.to_fund_id = f.id then t.amount else -t.amount end)
      from public.transfers t where (t.from_fund_id = f.id or t.to_fund_id = f.id)
        and t.deleted_at is null and t.occurred_on <= v_today), 0), cached_at = now()
    where f.owner_user_id = p_owner and f.deleted_at is null;
  return v_count;
end $$;
revoke all on function public.sync_financial_automation(uuid) from public, anon;
grant execute on function public.sync_financial_automation(uuid) to authenticated, service_role;
