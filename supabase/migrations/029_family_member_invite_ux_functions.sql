create or replace function public.get_household_members_for_display(target_household_id uuid)
returns table (
  household_id uuid,
  user_id uuid,
  role public.household_role,
  status public.household_member_status,
  invited_by uuid,
  joined_at timestamptz,
  removed_at timestamptz,
  full_name text,
  username text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
      and hm.status = 'ACTIVE'
  ) then
    raise exception 'Permessi insufficienti';
  end if;

  return query
  select
    hm.household_id,
    hm.user_id,
    hm.role,
    hm.status,
    hm.invited_by,
    hm.joined_at,
    hm.removed_at,
    p.full_name,
    p.username
  from public.household_members hm
  left join public.profiles p on p.id = hm.user_id
  where hm.household_id = target_household_id
  order by hm.created_at asc;
end;
$$;

revoke all on function public.get_household_members_for_display(uuid) from public;
grant execute on function public.get_household_members_for_display(uuid) to authenticated;

drop policy if exists household_invites_update_admin_non_accept on public.household_invites;
create policy household_invites_update_admin_non_accept on public.household_invites
for update using (public.is_household_admin(household_id, auth.uid()))
with check (
  public.is_household_admin(household_id, auth.uid())
  and status in ('PENDING', 'REJECTED', 'EXPIRED', 'CANCELLED')
);

create or replace function public.cancel_household_invite(invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invite public.household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_invite
  from public.household_invites
  where id = invite_id
  for update;

  if not found then
    raise exception 'Invito non trovato';
  end if;

  if not public.is_household_admin(target_invite.household_id, auth.uid()) then
    raise exception 'Permessi insufficienti';
  end if;

  if target_invite.status <> 'PENDING' then
    return target_invite.household_id;
  end if;

  update public.household_invites
  set status = 'CANCELLED',
      expires_at = least(expires_at, now())
  where id = target_invite.id;

  return target_invite.household_id;
end;
$$;

revoke all on function public.cancel_household_invite(uuid) from public;
grant execute on function public.cancel_household_invite(uuid) to authenticated;

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
    raise exception 'Invito non trovato';
  end if;

  if target_invite.status = 'CANCELLED' then
    raise exception 'Invito cancellato';
  end if;

  if target_invite.status in ('ACCEPTED', 'REJECTED') then
    return target_invite.household_id;
  end if;

  if target_invite.status <> 'PENDING' then
    raise exception 'Invito non più disponibile';
  end if;

  if target_invite.expires_at <= now() then
    update public.household_invites
    set status = 'EXPIRED'
    where id = target_invite.id;

    raise exception 'Invito scaduto';
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

create or replace function public.leave_household(target_household_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_member public.household_members%rowtype;
  active_members integer;
  active_admins integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into current_member
  from public.household_members
  where household_id = target_household_id
    and user_id = auth.uid()
    and status = 'ACTIVE'
  for update;

  if not found then
    raise exception 'Membership non trovata';
  end if;

  select count(*)
  into active_members
  from public.household_members
  where household_id = target_household_id
    and status = 'ACTIVE';

  select count(*)
  into active_admins
  from public.household_members
  where household_id = target_household_id
    and status = 'ACTIVE'
    and role in ('owner', 'admin');

  if active_members > 1 and current_member.role in ('owner', 'admin') and active_admins <= 1 then
    raise exception 'Nomina prima un altro admin per non lasciare la famiglia senza amministratore.';
  end if;

  update public.household_members
  set status = 'REMOVED',
      removed_at = now()
  where household_id = target_household_id
    and user_id = auth.uid();

  return target_household_id;
end;
$$;

revoke all on function public.leave_household(uuid) from public;
grant execute on function public.leave_household(uuid) to authenticated;
