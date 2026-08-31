create type public.notification_type as enum (
  'family_invite',
  'family_invite_accepted',
  'family_invite_rejected',
  'family_member_joined',
  'family_member_removed',
  'family_role_changed',
  'movement_shared_created',
  'movement_shared_updated',
  'movement_shared_deleted',
  'reimbursement_shared_created',
  'fund_shared_created',
  'fund_shared_updated',
  'fund_target_reached',
  'fund_target_exceeded',
  'fund_unshared',
  'budget_household_created',
  'budget_household_updated',
  'budget_exceeded',
  'transfer_shared'
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  household_id uuid references public.households(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid,
  destination_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint notifications_title_not_blank check (length(trim(title)) > 0),
  constraint notifications_body_not_blank check (length(trim(body)) > 0),
  constraint notifications_read_at_consistent check ((is_read = false and read_at is null) or (is_read = true and read_at is not null))
);

create unique index notifications_dedupe_key_idx on public.notifications(dedupe_key) where dedupe_key is not null;
create index notifications_recipient_created_idx on public.notifications(recipient_user_id, created_at desc);
create index notifications_recipient_unread_idx on public.notifications(recipient_user_id, is_read) where is_read = false;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint push_subscriptions_endpoint_not_blank check (length(trim(endpoint)) > 0),
  constraint push_subscriptions_p256dh_not_blank check (length(trim(p256dh)) > 0),
  constraint push_subscriptions_auth_not_blank check (length(trim(auth)) > 0)
);

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;

create policy notifications_select_own on public.notifications
for select using (recipient_user_id = auth.uid());

create policy notifications_update_own_read_state on public.notifications
for update using (recipient_user_id = auth.uid())
with check (
  recipient_user_id = auth.uid()
  and actor_user_id is not distinct from actor_user_id
  and household_id is not distinct from household_id
);

create policy push_subscriptions_select_own on public.push_subscriptions
for select using (user_id = auth.uid());

create policy push_subscriptions_insert_own on public.push_subscriptions
for insert with check (user_id = auth.uid());

create policy push_subscriptions_update_own on public.push_subscriptions
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy push_subscriptions_delete_own on public.push_subscriptions
for delete using (user_id = auth.uid());

create or replace function public.create_household_notifications(
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
returns table(notification_id uuid, recipient_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_active_household_member(target_household_id, auth.uid()) then
    raise exception 'Household access denied';
  end if;

  return query
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
  select
    hm.user_id,
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
      else concat(target_household_id::text, ':', hm.user_id::text, ':', dedupe_scope)
    end
  from public.household_members hm
  where hm.household_id = target_household_id
    and hm.status = 'ACTIVE'
    and hm.user_id <> auth.uid()
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning notifications.id, notifications.recipient_user_id;
end;
$$;

revoke all on function public.create_household_notifications(uuid, public.notification_type, text, text, text, uuid, text, jsonb, text) from public;
grant execute on function public.create_household_notifications(uuid, public.notification_type, text, text, text, uuid, text, jsonb, text) to authenticated;
