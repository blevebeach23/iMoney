create or replace function public.respond_to_household_invite(invite_token text, accept_invite boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_invite public.household_invites%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  current_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select *
  into target_invite
  from public.household_invites
  where token = invite_token
    and status = 'PENDING'
    and expires_at > now()
    and lower(email) = current_email
  for update;

  if not found then
    raise exception 'Invite not found';
  end if;

  if accept_invite then
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
      set role = 'member',
          status = 'ACTIVE',
          invited_by = excluded.invited_by,
          joined_at = coalesce(public.household_members.joined_at, now()),
          removed_at = null;

    insert into public.household_user_preferences (household_id, user_id, preferences)
    values (target_invite.household_id, auth.uid(), jsonb_build_object('share_new_movements_by_default', false))
    on conflict (household_id, user_id) do nothing;

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
