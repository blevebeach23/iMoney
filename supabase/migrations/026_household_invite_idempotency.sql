create or replace function public.household_email_has_valid_member(candidate_household_id uuid, candidate_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.household_members hm
    join auth.users u on u.id = hm.user_id
    where hm.household_id = candidate_household_id
      and hm.status in ('ACTIVE', 'INVITED')
      and lower(u.email) = lower(trim(candidate_email))
  );
$$;

revoke all on function public.household_email_has_valid_member(uuid, text) from public;
grant execute on function public.household_email_has_valid_member(uuid, text) to authenticated;

create or replace function public.prevent_household_invite_for_existing_member()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.status = 'PENDING' and public.household_email_has_valid_member(new.household_id, new.email) then
    raise exception 'Questo utente fa già parte della famiglia.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists household_invites_prevent_existing_member on public.household_invites;
create trigger household_invites_prevent_existing_member
before insert or update of household_id, email, status on public.household_invites
for each row execute function public.prevent_household_invite_for_existing_member();

create or replace function public.respond_to_household_invite(invite_token text, accept_invite boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invite public.household_invites%rowtype;
  current_email text;
  existing_member public.household_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select *
  into target_invite
  from public.household_invites
  where token = invite_token
    and lower(email) = current_email
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if target_invite.status <> 'PENDING' then
    return target_invite.household_id;
  end if;

  if target_invite.expires_at <= now() then
    update public.household_invites
    set status = 'EXPIRED'
    where id = target_invite.id;

    return target_invite.household_id;
  end if;

  if accept_invite then
    select *
    into existing_member
    from public.household_members
    where household_id = target_invite.household_id
      and user_id = auth.uid()
    for update;

    if found and existing_member.status = 'ACTIVE' then
      insert into public.household_user_preferences (household_id, user_id, preferences)
      values (target_invite.household_id, auth.uid(), jsonb_build_object('share_new_movements_by_default', false))
      on conflict (household_id, user_id) do nothing;
    else
      insert into public.household_members (
        household_id,
        user_id,
        role,
        status,
        invited_by,
        joined_at
      )
      values (
        target_invite.household_id,
        auth.uid(),
        'member',
        'ACTIVE',
        target_invite.invited_by,
        now()
      )
      on conflict (household_id, user_id) do update
        set role = case
              when public.household_members.status = 'ACTIVE' then public.household_members.role
              else 'member'
            end,
            status = 'ACTIVE',
            invited_by = case
              when public.household_members.status = 'ACTIVE' then public.household_members.invited_by
              else excluded.invited_by
            end,
            joined_at = coalesce(public.household_members.joined_at, now()),
            removed_at = null;

      insert into public.household_user_preferences (household_id, user_id, preferences)
      values (target_invite.household_id, auth.uid(), jsonb_build_object('share_new_movements_by_default', false))
      on conflict (household_id, user_id) do nothing;
    end if;

    update public.household_invites
    set status = 'ACCEPTED',
        accepted_by = auth.uid()
    where id = target_invite.id;
  else
    update public.household_invites
    set status = 'REJECTED',
        accepted_by = auth.uid()
    where id = target_invite.id;
  end if;

  return target_invite.household_id;
end;
$$;

revoke all on function public.respond_to_household_invite(text, boolean) from public;
grant execute on function public.respond_to_household_invite(text, boolean) to authenticated;
