create or replace function public.email_is_registered(candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(candidate_email))
  );
$$;

revoke all on function public.email_is_registered(text) from public;
grant execute on function public.email_is_registered(text) to anon;
grant execute on function public.email_is_registered(text) to authenticated;
