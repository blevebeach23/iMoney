alter table public.fixed_expense_requests
  add column if not exists category_id uuid references public.categories(id) on delete set null,
  add column if not exists category_label text;

drop function if exists public.create_fixed_expense_request(uuid, uuid, text, numeric, date, date, integer, integer[], text, boolean);

create or replace function public.create_fixed_expense_request(
  target_household_id uuid,
  target_recipient_user_id uuid,
  request_description text,
  request_amount numeric,
  request_category_id uuid,
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
  selected_category_label text;
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

  if request_category_id is null then
    raise exception 'Category required';
  end if;

  if not public.user_can_access_category(request_category_id, auth.uid(), target_household_id) then
    raise exception 'Category access denied';
  end if;

  if not public.user_can_access_category(request_category_id, target_recipient_user_id, target_household_id) then
    raise exception 'Recipient category access denied';
  end if;

  select concat(mc.name, ' / ', c.name)
  into selected_category_label
  from public.categories c
  join public.macro_categories mc on mc.id = c.macro_category_id
  where c.id = request_category_id
    and c.deleted_at is null
    and mc.deleted_at is null;

  if selected_category_label is null then
    raise exception 'Category not found';
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
    category_id,
    category_label,
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
    request_category_id,
    selected_category_label,
    request_starts_on,
    request_ends_on,
    request_day_of_month,
    request_active_months,
    trim(coalesce(request_notes, '')),
    true
  )
  returning id into inserted_request_id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (
    auth.uid(),
    target_household_id,
    'fixed_expense_request',
    inserted_request_id,
    'created',
    jsonb_build_object('recipient_user_id', target_recipient_user_id, 'category_id', request_category_id)
  );

  return query select inserted_request_id;
end;
$$;

drop function if exists public.accept_fixed_expense_request(uuid, uuid, uuid, uuid);

create or replace function public.accept_fixed_expense_request(
  target_request_id uuid,
  accepted_account_id uuid,
  accepted_fund_id uuid,
  accepted_category_id uuid default null
)
returns table(request_id uuid, accepted_fixed_expense_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.fixed_expense_requests%rowtype;
  inserted_fixed_expense_id uuid;
  selected_category_id uuid;
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

  selected_category_id := coalesce(target_request.category_id, accepted_category_id);

  if selected_category_id is null then
    raise exception 'Category required';
  end if;

  if not public.user_can_access_category(selected_category_id, auth.uid(), target_request.household_id) then
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
    selected_category_id,
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
  values (
    auth.uid(),
    target_request.household_id,
    'fixed_expense_request',
    target_request.id,
    'accepted',
    jsonb_build_object('accepted_fixed_expense_id', inserted_fixed_expense_id, 'category_id', selected_category_id)
  );

  return query select target_request.id, inserted_fixed_expense_id;
end;
$$;

drop function if exists public.get_fixed_expense_requests_for_display(uuid);

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
  category_id uuid,
  category_label text,
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
    fer.category_id,
    fer.category_label,
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

drop function if exists public.get_fixed_expense_request_for_display(uuid);

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
  category_id uuid,
  category_label text,
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
    fer.category_id,
    fer.category_label,
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

revoke all on function public.create_fixed_expense_request(uuid, uuid, text, numeric, uuid, date, date, integer, integer[], text, boolean) from public;
revoke all on function public.accept_fixed_expense_request(uuid, uuid, uuid, uuid) from public;
revoke all on function public.get_fixed_expense_requests_for_display(uuid) from public;
revoke all on function public.get_fixed_expense_request_for_display(uuid) from public;

grant execute on function public.create_fixed_expense_request(uuid, uuid, text, numeric, uuid, date, date, integer, integer[], text, boolean) to authenticated;
grant execute on function public.accept_fixed_expense_request(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.get_fixed_expense_requests_for_display(uuid) to authenticated;
grant execute on function public.get_fixed_expense_request_for_display(uuid) to authenticated;
