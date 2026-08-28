alter table public.profiles
add column onboarding_completed boolean not null default false,
add column onboarding_completed_at timestamptz;

alter table public.accounts
add column opening_balance_date date not null default current_date;

create unique index profiles_username_lower_unique_idx on public.profiles(lower(username));

create or replace function public.normalize_username(raw_username text, fallback_email text, fallback_user_id uuid)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(coalesce(nullif(trim(raw_username), ''), split_part(fallback_email, '@', 1), fallback_user_id::text), '[^a-z0-9_]+', '_', 'g'));
  base_username := trim(both '_' from base_username);

  if length(base_username) < 3 then
    base_username := 'user_' || right(replace(fallback_user_id::text, '-', ''), 16);
  end if;

  return left(base_username, 32);
end;
$$;

-- SECURITY DEFINER is required because this trigger runs from auth.users and
-- creates the application profile without relying on client-side profile writes.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    public.normalize_username(new.raw_user_meta_data ->> 'username', new.email, new.id),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Utente')
  )
  on conflict (id) do update
    set full_name = excluded.full_name,
        updated_at = now();

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- SECURITY DEFINER lets authenticated users check username availability without
-- gaining read access to other users' profile rows.
create or replace function public.is_username_available(candidate_username text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select length(trim(candidate_username)) >= 3
    and not exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(trim(candidate_username))
        and p.id <> auth.uid()
    );
$$;

revoke all on function public.normalize_username(text, text, uuid) from public;
revoke all on function public.handle_new_auth_user() from public;
revoke all on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to authenticated;
