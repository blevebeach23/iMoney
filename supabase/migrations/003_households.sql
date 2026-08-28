create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.household_role not null default 'member',
  status public.household_member_status not null default 'INVITED',
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint household_members_active_joined check (status <> 'ACTIVE' or joined_at is not null),
  constraint household_members_removed_timestamp check (status <> 'REMOVED' or removed_at is not null)
);

create table public.household_user_preferences (
  household_id uuid not null,
  user_id uuid not null,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  foreign key (household_id, user_id)
    references public.household_members(household_id, user_id)
    on delete cascade
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  email text not null,
  phone text,
  token text not null unique,
  status public.household_invite_status not null default 'PENDING',
  expires_at timestamptz not null,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_invites_email_not_blank check (length(trim(email)) > 3),
  constraint household_invites_token_not_blank check (length(trim(token)) >= 32),
  constraint household_invites_pending_not_expired check (status <> 'PENDING' or expires_at > created_at)
);

create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

create trigger household_members_set_updated_at
before update on public.household_members
for each row execute function public.set_updated_at();

create trigger household_user_preferences_set_updated_at
before update on public.household_user_preferences
for each row execute function public.set_updated_at();

create trigger household_invites_set_updated_at
before update on public.household_invites
for each row execute function public.set_updated_at();

create index household_members_user_idx on public.household_members(user_id);
create index household_members_household_status_idx on public.household_members(household_id, status);
create index household_invites_household_status_idx on public.household_invites(household_id, status);
create index household_invites_email_status_idx on public.household_invites(lower(email), status);
create unique index household_invites_pending_email_idx
  on public.household_invites(household_id, lower(email))
  where status = 'PENDING';
