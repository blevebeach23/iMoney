create type public.fixed_expense_request_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

alter type public.notification_type add value if not exists 'fixed_expense_request_created';
alter type public.notification_type add value if not exists 'fixed_expense_request_accepted';
alter type public.notification_type add value if not exists 'fixed_expense_request_rejected';
alter type public.notification_type add value if not exists 'fixed_expense_request_cancelled';

create table public.fixed_expense_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null,
  starts_on date not null,
  ends_on date,
  day_of_month integer not null default 1,
  active_months integer[] not null default array[1,2,3,4,5,6,7,8,9,10,11,12],
  notes text not null default '',
  shared_with_family boolean not null default true,
  status public.fixed_expense_request_status not null default 'PENDING',
  accepted_fixed_expense_id uuid references public.fixed_expenses(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint fixed_expense_requests_creator_recipient_different check (created_by_user_id <> recipient_user_id),
  constraint fixed_expense_requests_description_not_blank check (length(trim(description)) > 0),
  constraint fixed_expense_requests_amount_positive check (amount > 0),
  constraint fixed_expense_requests_day_valid check (day_of_month between 1 and 31),
  constraint fixed_expense_requests_active_months_valid check (
    active_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]
    and cardinality(active_months) > 0
  ),
  constraint fixed_expense_requests_shared_family check (shared_with_family = true),
  constraint fixed_expense_requests_valid_date_range check (ends_on is null or ends_on >= starts_on),
  constraint fixed_expense_requests_accepted_consistency check (
    (status = 'ACCEPTED' and accepted_fixed_expense_id is not null and responded_at is not null)
    or (status <> 'ACCEPTED' and accepted_fixed_expense_id is null)
  ),
  constraint fixed_expense_requests_closed_consistency check (
    (status = 'PENDING' and responded_at is null)
    or (status <> 'PENDING' and responded_at is not null)
  )
);

create index fixed_expense_requests_household_status_idx
  on public.fixed_expense_requests(household_id, status, created_at desc);
create index fixed_expense_requests_creator_idx
  on public.fixed_expense_requests(created_by_user_id, created_at desc);
create index fixed_expense_requests_recipient_idx
  on public.fixed_expense_requests(recipient_user_id, created_at desc);

alter table public.fixed_expense_requests enable row level security;

create policy fixed_expense_requests_creator_recipient_select on public.fixed_expense_requests
for select using (
  public.is_active_household_member(household_id, auth.uid())
  and auth.uid() in (created_by_user_id, recipient_user_id)
);

create or replace function public.create_fixed_expense_request(
  target_household_id uuid,
  target_recipient_user_id uuid,
  request_description text,
  request_amount numeric,
  request_starts_on date,
  request_ends_on date,
  request_day_of_month integer,
  request_active_months integer[],
  request_notes text,
  request_shared_with_family boolean
)
returns table(request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if auth.uid() = target_recipient_user_id then
    raise exception 'Use a normal fixed expense for yourself';
  end if;

  if not public.is_active_household_member(target_household_id, auth.uid()) then
    raise exception 'Household access denied';
  end if;

  if not public.is_active_household_member(target_household_id, target_recipient_user_id) then
    raise exception 'Recipient access denied';
  end if;

  if request_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  if request_day_of_month not between 1 and 31 then
    raise exception 'Day of month must be between 1 and 31';
  end if;

  if coalesce(request_shared_with_family, false) <> true then
    raise exception 'Fixed expense request must be shared with family';
  end if;

  insert into public.fixed_expense_requests (
    household_id,
    created_by_user_id,
    recipient_user_id,
    description,
    amount,
    starts_on,
    ends_on,
    day_of_month,
    active_months,
    notes,
    shared_with_family
  )
  values (
    target_household_id,
    auth.uid(),
    target_recipient_user_id,
    trim(request_description),
    request_amount,
    request_starts_on,
    request_ends_on,
    request_day_of_month,
    request_active_months,
    trim(coalesce(request_notes, '')),
    true
  )
  returning id into inserted_request_id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_household_id, 'fixed_expense_request', inserted_request_id, 'created', jsonb_build_object('recipient_user_id', target_recipient_user_id));

  return query select inserted_request_id;
end;
$$;

create or replace function public.accept_fixed_expense_request(
  target_request_id uuid,
  accepted_account_id uuid,
  accepted_fund_id uuid,
  accepted_category_id uuid
)
returns table(request_id uuid, accepted_fixed_expense_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.fixed_expense_requests%rowtype;
  inserted_fixed_expense_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_request
  from public.fixed_expense_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Fixed expense request not found';
  end if;

  if target_request.recipient_user_id <> auth.uid() then
    raise exception 'Only the recipient can accept this request';
  end if;

  if target_request.status = 'ACCEPTED' then
    return query select target_request.id, target_request.accepted_fixed_expense_id;
    return;
  end if;

  if target_request.status <> 'PENDING' then
    raise exception 'Fixed expense request is already closed';
  end if;

  if not public.is_active_household_member(target_request.household_id, auth.uid()) then
    raise exception 'Household access denied';
  end if;

  if ((accepted_account_id is not null)::int + (accepted_fund_id is not null)::int) <> 1 then
    raise exception 'Select exactly one account or fund';
  end if;

  if not public.user_can_access_account(accepted_account_id, auth.uid(), target_request.household_id) then
    raise exception 'Account access denied';
  end if;

  if not public.user_can_access_fund(accepted_fund_id, auth.uid(), target_request.household_id) then
    raise exception 'Fund access denied';
  end if;

  if not public.user_can_access_category(accepted_category_id, auth.uid(), target_request.household_id) then
    raise exception 'Category access denied';
  end if;

  insert into public.fixed_expenses (
    owner_user_id,
    household_id,
    account_id,
    fund_id,
    category_id,
    amount,
    description,
    frequency,
    starts_on,
    ends_on,
    shared_with_family,
    day_of_month,
    active_months
  )
  values (
    auth.uid(),
    target_request.household_id,
    accepted_account_id,
    accepted_fund_id,
    accepted_category_id,
    target_request.amount,
    target_request.description,
    'monthly',
    target_request.starts_on,
    target_request.ends_on,
    true,
    target_request.day_of_month,
    target_request.active_months
  )
  returning id into inserted_fixed_expense_id;

  update public.fixed_expense_requests
  set status = 'ACCEPTED',
      accepted_fixed_expense_id = inserted_fixed_expense_id,
      responded_at = now()
  where id = target_request.id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_request.household_id, 'fixed_expense_request', target_request.id, 'accepted', jsonb_build_object('accepted_fixed_expense_id', inserted_fixed_expense_id));

  return query select target_request.id, inserted_fixed_expense_id;
end;
$$;

create or replace function public.reject_fixed_expense_request(target_request_id uuid)
returns table(request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.fixed_expense_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_request
  from public.fixed_expense_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Fixed expense request not found';
  end if;

  if target_request.recipient_user_id <> auth.uid() then
    raise exception 'Only the recipient can reject this request';
  end if;

  if target_request.status <> 'PENDING' then
    raise exception 'Fixed expense request is already closed';
  end if;

  update public.fixed_expense_requests
  set status = 'REJECTED',
      responded_at = now()
  where id = target_request.id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_request.household_id, 'fixed_expense_request', target_request.id, 'rejected', '{}'::jsonb);

  return query select target_request.id;
end;
$$;

create or replace function public.cancel_fixed_expense_request(target_request_id uuid)
returns table(request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.fixed_expense_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_request
  from public.fixed_expense_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Fixed expense request not found';
  end if;

  if target_request.created_by_user_id <> auth.uid() then
    raise exception 'Only the creator can cancel this request';
  end if;

  if target_request.status <> 'PENDING' then
    raise exception 'Fixed expense request is already closed';
  end if;

  update public.fixed_expense_requests
  set status = 'CANCELLED',
      responded_at = now()
  where id = target_request.id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_request.household_id, 'fixed_expense_request', target_request.id, 'cancelled', '{}'::jsonb);

  return query select target_request.id;
end;
$$;

create or replace function public.get_fixed_expense_requests_for_display(target_household_id uuid)
returns table(
  id uuid,
  household_id uuid,
  created_by_user_id uuid,
  creator_name text,
  recipient_user_id uuid,
  recipient_name text,
  description text,
  amount numeric,
  starts_on date,
  ends_on date,
  day_of_month integer,
  active_months integer[],
  notes text,
  shared_with_family boolean,
  status public.fixed_expense_request_status,
  accepted_fixed_expense_id uuid,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    fer.id,
    fer.household_id,
    fer.created_by_user_id,
    coalesce(nullif(cp.full_name, ''), nullif(cp.username, ''), 'Membro') as creator_name,
    fer.recipient_user_id,
    coalesce(nullif(rp.full_name, ''), nullif(rp.username, ''), 'Membro') as recipient_name,
    fer.description,
    fer.amount,
    fer.starts_on,
    fer.ends_on,
    fer.day_of_month,
    fer.active_months,
    fer.notes,
    fer.shared_with_family,
    fer.status,
    fer.accepted_fixed_expense_id,
    fer.created_at,
    fer.responded_at
  from public.fixed_expense_requests fer
  join public.profiles cp on cp.id = fer.created_by_user_id
  join public.profiles rp on rp.id = fer.recipient_user_id
  where fer.household_id = target_household_id
    and public.is_active_household_member(fer.household_id, auth.uid())
    and auth.uid() in (fer.created_by_user_id, fer.recipient_user_id)
  order by fer.created_at desc;
$$;

create or replace function public.get_fixed_expense_request_for_display(target_request_id uuid)
returns table(
  id uuid,
  household_id uuid,
  created_by_user_id uuid,
  creator_name text,
  recipient_user_id uuid,
  recipient_name text,
  description text,
  amount numeric,
  starts_on date,
  ends_on date,
  day_of_month integer,
  active_months integer[],
  notes text,
  shared_with_family boolean,
  status public.fixed_expense_request_status,
  accepted_fixed_expense_id uuid,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    fer.id,
    fer.household_id,
    fer.created_by_user_id,
    coalesce(nullif(cp.full_name, ''), nullif(cp.username, ''), 'Membro') as creator_name,
    fer.recipient_user_id,
    coalesce(nullif(rp.full_name, ''), nullif(rp.username, ''), 'Membro') as recipient_name,
    fer.description,
    fer.amount,
    fer.starts_on,
    fer.ends_on,
    fer.day_of_month,
    fer.active_months,
    fer.notes,
    fer.shared_with_family,
    fer.status,
    fer.accepted_fixed_expense_id,
    fer.created_at,
    fer.responded_at
  from public.fixed_expense_requests fer
  join public.profiles cp on cp.id = fer.created_by_user_id
  join public.profiles rp on rp.id = fer.recipient_user_id
  where fer.id = target_request_id
    and public.is_active_household_member(fer.household_id, auth.uid())
    and auth.uid() in (fer.created_by_user_id, fer.recipient_user_id);
$$;

revoke all on function public.create_fixed_expense_request(uuid, uuid, text, numeric, date, date, integer, integer[], text, boolean) from public;
revoke all on function public.accept_fixed_expense_request(uuid, uuid, uuid, uuid) from public;
revoke all on function public.reject_fixed_expense_request(uuid) from public;
revoke all on function public.cancel_fixed_expense_request(uuid) from public;
revoke all on function public.get_fixed_expense_requests_for_display(uuid) from public;
revoke all on function public.get_fixed_expense_request_for_display(uuid) from public;

grant execute on function public.create_fixed_expense_request(uuid, uuid, text, numeric, date, date, integer, integer[], text, boolean) to authenticated;
grant execute on function public.accept_fixed_expense_request(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.reject_fixed_expense_request(uuid) to authenticated;
grant execute on function public.cancel_fixed_expense_request(uuid) to authenticated;
grant execute on function public.get_fixed_expense_requests_for_display(uuid) to authenticated;
grant execute on function public.get_fixed_expense_request_for_display(uuid) to authenticated;
