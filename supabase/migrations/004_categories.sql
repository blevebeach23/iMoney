create table public.macro_categories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint macro_categories_owner_xor_household check (
    (owner_user_id is not null)::int + (household_id is not null)::int = 1
  ),
  constraint macro_categories_name_not_blank check (length(trim(name)) > 0)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  macro_category_id uuid not null references public.macro_categories(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_not_blank check (length(trim(name)) > 0)
);

create trigger macro_categories_set_updated_at
before update on public.macro_categories
for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create index categories_macro_category_idx on public.categories(macro_category_id);
create index macro_categories_owner_idx on public.macro_categories(owner_user_id) where owner_user_id is not null;
create index macro_categories_household_idx on public.macro_categories(household_id) where household_id is not null;
create unique index macro_categories_owner_name_idx
  on public.macro_categories(owner_user_id, lower(name))
  where owner_user_id is not null;
create unique index macro_categories_household_name_idx
  on public.macro_categories(household_id, lower(name))
  where household_id is not null;
create unique index categories_macro_name_idx on public.categories(macro_category_id, lower(name));
