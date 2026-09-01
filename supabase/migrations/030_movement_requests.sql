create type public.movement_request_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

alter type public.notification_type add value if not exists 'movement_request_created';
alter type public.notification_type add value if not exists 'movement_request_accepted';
alter type public.notification_type add value if not exists 'movement_request_rejected';
alter type public.notification_type add value if not exists 'movement_request_cancelled';

create table public.movement_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  description text not null,
  movement_type public.movement_type not null,
  amount numeric(14,2) not null,
  category_id uuid references public.categories(id) on delete set null,
  category_label text,
  movement_date date not null,
  notes text not null default '',
  shared_with_family boolean not null default true,
  reimbursement_for_movement_id uuid references public.movements(id) on delete set null,
  status public.movement_request_status not null default 'PENDING',
  accepted_movement_id uuid references public.movements(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint movement_requests_creator_recipient_different check (created_by_user_id <> recipient_user_id),
  constraint movement_requests_description_not_blank check (length(trim(description)) > 0),
  constraint movement_requests_amount_positive check (amount > 0),
  constraint movement_requests_accepted_consistency check (
    (status = 'ACCEPTED' and accepted_movement_id is not null and responded_at is not null)
    or (status <> 'ACCEPTED' and accepted_movement_id is null)
  ),
  constraint movement_requests_closed_consistency check (
    (status = 'PENDING' and responded_at is null)
    or (status <> 'PENDING' and responded_at is not null)
  ),
  constraint movement_requests_reimbursement_target check (
    movement_type = 'reimbursement'
    or (movement_type <> 'reimbursement' and reimbursement_for_movement_id is null)
  )
);

create index movement_requests_household_status_idx
  on public.movement_requests(household_id, status, created_at desc);
create index movement_requests_creator_idx
  on public.movement_requests(created_by_user_id, created_at desc);
create index movement_requests_recipient_idx
  on public.movement_requests(recipient_user_id, created_at desc);

alter table public.movement_requests enable row level security;

create policy movement_requests_creator_recipient_select on public.movement_requests
for select using (
  public.is_active_household_member(household_id, auth.uid())
  and auth.uid() in (created_by_user_id, recipient_user_id)
);

create or replace function public.create_direct_notification(
  target_recipient_user_id uuid,
  target_household_id uuid,
  notification_type public.notification_type,
  notification_title text,
  notification_body text,
  entity_type text default null,
  entity_id uuid default null,
  destination_url text default null,
  notification_metadata jsonb default '{}'::jsonb,
  dedupe_scope text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_notification_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if target_recipient_user_id = auth.uid() then
    raise exception 'Cannot notify yourself';
  end if;

  if not public.is_active_household_member(target_household_id, auth.uid()) then
    raise exception 'Household access denied';
  end if;

  if not public.is_active_household_member(target_household_id, target_recipient_user_id) then
    raise exception 'Recipient access denied';
  end if;

  insert into public.notifications (
    recipient_user_id,
    actor_user_id,
    household_id,
    type,
    title,
    body,
    entity_type,
    entity_id,
    destination_url,
    metadata,
    dedupe_key
  )
  values (
    target_recipient_user_id,
    auth.uid(),
    target_household_id,
    notification_type,
    trim(notification_title),
    trim(notification_body),
    entity_type,
    entity_id,
    destination_url,
    coalesce(notification_metadata, '{}'::jsonb),
    case
      when dedupe_scope is null then null
      else concat(target_household_id::text, ':', target_recipient_user_id::text, ':', dedupe_scope)
    end
  )
  on conflict (dedupe_key) where dedupe_key is not null do update
    set dedupe_key = excluded.dedupe_key
  returning id into inserted_notification_id;

  return inserted_notification_id;
end;
$$;

create or replace function public.create_movement_request(
  target_household_id uuid,
  target_recipient_user_id uuid,
  request_description text,
  request_movement_type public.movement_type,
  request_amount numeric,
  request_category_id uuid,
  request_category_label text,
  request_movement_date date,
  request_notes text,
  request_shared_with_family boolean,
  request_reimbursement_for_movement_id uuid default null
)
returns table(request_id uuid, notification_id uuid)
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
    raise exception 'Use a normal movement for yourself';
  end if;

  if not public.is_active_household_member(target_household_id, auth.uid()) then
    raise exception 'Household access denied';
  end if;

  if not public.is_active_household_member(target_household_id, target_recipient_user_id) then
    raise exception 'Recipient access denied';
  end if;

  if request_category_id is not null and not public.user_can_access_category(request_category_id, auth.uid(), target_household_id) then
    raise exception 'Category access denied';
  end if;

  if request_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  insert into public.movement_requests (
    household_id,
    created_by_user_id,
    recipient_user_id,
    description,
    movement_type,
    amount,
    category_id,
    category_label,
    movement_date,
    notes,
    shared_with_family,
    reimbursement_for_movement_id
  )
  values (
    target_household_id,
    auth.uid(),
    target_recipient_user_id,
    trim(request_description),
    request_movement_type,
    request_amount,
    request_category_id,
    nullif(trim(coalesce(request_category_label, '')), ''),
    request_movement_date,
    trim(coalesce(request_notes, '')),
    request_shared_with_family,
    request_reimbursement_for_movement_id
  )
  returning id into inserted_request_id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_household_id, 'movement_request', inserted_request_id, 'created', jsonb_build_object('recipient_user_id', target_recipient_user_id));

  return query select inserted_request_id, null::uuid;
end;
$$;

create or replace function public.accept_movement_request(
  target_request_id uuid,
  accepted_account_id uuid,
  accepted_fund_id uuid,
  accepted_category_id uuid,
  accepted_reimbursement_for_movement_id uuid default null
)
returns table(request_id uuid, accepted_movement_id uuid, notification_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.movement_requests%rowtype;
  inserted_movement_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_request
  from public.movement_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Movement request not found';
  end if;

  if target_request.recipient_user_id <> auth.uid() then
    raise exception 'Only the recipient can accept this request';
  end if;

  if target_request.status = 'ACCEPTED' then
    return query select target_request.id, target_request.accepted_movement_id, null::uuid;
    return;
  end if;

  if target_request.status <> 'PENDING' then
    raise exception 'Movement request is already closed';
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

  if not public.user_can_reference_reimbursement(accepted_reimbursement_for_movement_id, auth.uid()) then
    raise exception 'Reimbursement target access denied';
  end if;

  insert into public.movements (
    owner_user_id,
    household_id,
    account_id,
    fund_id,
    category_id,
    type,
    amount,
    occurred_on,
    description,
    shared_with_family,
    reimbursement_for_movement_id,
    notes,
    created_by,
    updated_by
  )
  values (
    auth.uid(),
    case when target_request.shared_with_family then target_request.household_id else null end,
    accepted_account_id,
    accepted_fund_id,
    accepted_category_id,
    target_request.movement_type,
    target_request.amount,
    target_request.movement_date,
    target_request.description,
    target_request.shared_with_family,
    case when target_request.movement_type = 'reimbursement' then accepted_reimbursement_for_movement_id else null end,
    target_request.notes,
    auth.uid(),
    auth.uid()
  )
  returning id into inserted_movement_id;

  update public.movement_requests
  set status = 'ACCEPTED',
      accepted_movement_id = inserted_movement_id,
      responded_at = now()
  where id = target_request.id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_request.household_id, 'movement_request', target_request.id, 'accepted', jsonb_build_object('accepted_movement_id', inserted_movement_id));

  return query select target_request.id, inserted_movement_id, null::uuid;
end;
$$;

create or replace function public.reject_movement_request(target_request_id uuid)
returns table(request_id uuid, notification_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.movement_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_request
  from public.movement_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Movement request not found';
  end if;

  if target_request.recipient_user_id <> auth.uid() then
    raise exception 'Only the recipient can reject this request';
  end if;

  if target_request.status <> 'PENDING' then
    raise exception 'Movement request is already closed';
  end if;

  update public.movement_requests
  set status = 'REJECTED',
      responded_at = now()
  where id = target_request.id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_request.household_id, 'movement_request', target_request.id, 'rejected', '{}'::jsonb);

  return query select target_request.id, null::uuid;
end;
$$;

create or replace function public.cancel_movement_request(target_request_id uuid)
returns table(request_id uuid, notification_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_request public.movement_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_request
  from public.movement_requests
  where id = target_request_id
  for update;

  if not found then
    raise exception 'Movement request not found';
  end if;

  if target_request.created_by_user_id <> auth.uid() then
    raise exception 'Only the creator can cancel this request';
  end if;

  if target_request.status <> 'PENDING' then
    raise exception 'Movement request is already closed';
  end if;

  update public.movement_requests
  set status = 'CANCELLED',
      responded_at = now()
  where id = target_request.id;

  insert into public.audit_log(actor_user_id, household_id, entity_type, entity_id, action, metadata)
  values (auth.uid(), target_request.household_id, 'movement_request', target_request.id, 'cancelled', '{}'::jsonb);

  return query select target_request.id, null::uuid;
end;
$$;

create or replace function public.get_movement_requests_for_display(target_household_id uuid)
returns table(
  id uuid,
  household_id uuid,
  created_by_user_id uuid,
  creator_name text,
  recipient_user_id uuid,
  recipient_name text,
  description text,
  movement_type public.movement_type,
  amount numeric,
  category_id uuid,
  category_label text,
  movement_date date,
  notes text,
  shared_with_family boolean,
  reimbursement_for_movement_id uuid,
  status public.movement_request_status,
  accepted_movement_id uuid,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    mr.id,
    mr.household_id,
    mr.created_by_user_id,
    coalesce(nullif(cp.full_name, ''), nullif(cp.username, ''), 'Membro') as creator_name,
    mr.recipient_user_id,
    coalesce(nullif(rp.full_name, ''), nullif(rp.username, ''), 'Membro') as recipient_name,
    mr.description,
    mr.movement_type,
    mr.amount,
    mr.category_id,
    mr.category_label,
    mr.movement_date,
    mr.notes,
    mr.shared_with_family,
    mr.reimbursement_for_movement_id,
    mr.status,
    mr.accepted_movement_id,
    mr.created_at,
    mr.responded_at
  from public.movement_requests mr
  join public.profiles cp on cp.id = mr.created_by_user_id
  join public.profiles rp on rp.id = mr.recipient_user_id
  where mr.household_id = target_household_id
    and public.is_active_household_member(mr.household_id, auth.uid())
    and auth.uid() in (mr.created_by_user_id, mr.recipient_user_id)
  order by mr.created_at desc;
$$;

create or replace function public.get_movement_request_for_display(target_request_id uuid)
returns table(
  id uuid,
  household_id uuid,
  created_by_user_id uuid,
  creator_name text,
  recipient_user_id uuid,
  recipient_name text,
  description text,
  movement_type public.movement_type,
  amount numeric,
  category_id uuid,
  category_label text,
  movement_date date,
  notes text,
  shared_with_family boolean,
  reimbursement_for_movement_id uuid,
  status public.movement_request_status,
  accepted_movement_id uuid,
  created_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    mr.id,
    mr.household_id,
    mr.created_by_user_id,
    coalesce(nullif(cp.full_name, ''), nullif(cp.username, ''), 'Membro') as creator_name,
    mr.recipient_user_id,
    coalesce(nullif(rp.full_name, ''), nullif(rp.username, ''), 'Membro') as recipient_name,
    mr.description,
    mr.movement_type,
    mr.amount,
    mr.category_id,
    mr.category_label,
    mr.movement_date,
    mr.notes,
    mr.shared_with_family,
    mr.reimbursement_for_movement_id,
    mr.status,
    mr.accepted_movement_id,
    mr.created_at,
    mr.responded_at
  from public.movement_requests mr
  join public.profiles cp on cp.id = mr.created_by_user_id
  join public.profiles rp on rp.id = mr.recipient_user_id
  where mr.id = target_request_id
    and public.is_active_household_member(mr.household_id, auth.uid())
    and auth.uid() in (mr.created_by_user_id, mr.recipient_user_id);
$$;

revoke all on function public.create_direct_notification(uuid, uuid, public.notification_type, text, text, text, uuid, text, jsonb, text) from public;
revoke all on function public.create_movement_request(uuid, uuid, text, public.movement_type, numeric, uuid, text, date, text, boolean, uuid) from public;
revoke all on function public.accept_movement_request(uuid, uuid, uuid, uuid, uuid) from public;
revoke all on function public.reject_movement_request(uuid) from public;
revoke all on function public.cancel_movement_request(uuid) from public;
revoke all on function public.get_movement_requests_for_display(uuid) from public;
revoke all on function public.get_movement_request_for_display(uuid) from public;

grant execute on function public.create_direct_notification(uuid, uuid, public.notification_type, text, text, text, uuid, text, jsonb, text) to authenticated;
grant execute on function public.create_movement_request(uuid, uuid, text, public.movement_type, numeric, uuid, text, date, text, boolean, uuid) to authenticated;
grant execute on function public.accept_movement_request(uuid, uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.reject_movement_request(uuid) to authenticated;
grant execute on function public.cancel_movement_request(uuid) to authenticated;
grant execute on function public.get_movement_requests_for_display(uuid) to authenticated;
grant execute on function public.get_movement_request_for_display(uuid) to authenticated;
