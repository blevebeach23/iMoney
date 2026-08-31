-- Foundation RLS test scenarios.
-- Run against a local Supabase database after applying all migrations.
-- These tests use direct inserts as a privileged setup step, then switch to the
-- authenticated role and set JWT claims to exercise RLS behavior.

begin;

create schema if not exists test;
grant usage on schema test to authenticated;

create or replace function test.set_auth(test_user_id uuid, test_email text)
returns void
language sql
as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', test_user_id::text, 'email', test_email)::text,
    true
  );
$$;

create or replace function test.ok(test_name text, condition boolean)
returns void
language plpgsql
as $$
begin
  if not condition then
    raise exception 'RLS test failed: %', test_name;
  end if;
end;
$$;

grant execute on function test.set_auth(uuid, text) to authenticated;
grant execute on function test.ok(text, boolean) to authenticated;

create or replace function test.denied(test_name text, statement text)
returns void
language plpgsql
as $$
begin
  execute statement;
  raise exception 'RLS test failed, statement was allowed: %', test_name;
exception
  when insufficient_privilege or with_check_option_violation or check_violation or foreign_key_violation or unique_violation then
    return;
end;
$$;

grant execute on function test.denied(text, text) to authenticated;

insert into auth.users(id, email)
values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.test');

insert into public.profiles(id, username, full_name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'user-a', 'User A'),
  ('00000000-0000-0000-0000-0000000000b1', 'user-b', 'User B'),
  ('00000000-0000-0000-0000-0000000000c1', 'user-c', 'User C')
on conflict (id) do update
  set username = excluded.username,
      full_name = excluded.full_name;

insert into public.households(id, name, created_by)
values
  ('10000000-0000-0000-0000-000000000001', 'Household AB', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000002', 'Household C', '00000000-0000-0000-0000-0000000000c1');

insert into public.household_members(household_id, user_id, role, status, joined_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'owner', 'ACTIVE', now()),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b1', 'member', 'ACTIVE', now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'owner', 'ACTIVE', now());

insert into public.macro_categories(id, owner_user_id, name)
values
  ('20000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'A personal'),
  ('20000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'B personal');

insert into public.categories(id, macro_category_id, name)
values
  ('30000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-0000000000a1', 'A category'),
  ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1', 'B category');

insert into public.accounts(id, owner_user_id, name, type)
values
  ('40000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'A account', 'bank'),
  ('40000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'B account', 'bank');

insert into public.funds(id, owner_user_id, name)
values
  ('50000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'A fund'),
  ('50000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b1', 'B fund');

insert into public.funds(id, owner_user_id, household_id, name, shared_with_family)
values
  ('50000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'A shared fund', true);

insert into public.movements(id, owner_user_id, account_id, category_id, type, amount, occurred_on, description)
values
  ('60000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'expense', 10, current_date, 'private');

insert into public.movements(id, owner_user_id, household_id, account_id, category_id, type, amount, occurred_on, description, shared_with_family)
values
  ('60000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'expense', 20, current_date, 'shared', true);

set local role authenticated;

select test.set_auth('00000000-0000-0000-0000-0000000000a1', 'a@example.test');
select test.ok('User A reads own movement', exists(select 1 from public.movements where id = '60000000-0000-0000-0000-0000000000a1'));
select test.ok('User A can create initial household through RPC', public.create_household('Household RPC') is not null);
select test.ok(
  'User A becomes active owner after household RPC',
  exists(
    select 1
    from public.household_members hm
    join public.households h on h.id = hm.household_id
    where h.name = 'Household RPC'
      and h.created_by = '00000000-0000-0000-0000-0000000000a1'
      and hm.user_id = '00000000-0000-0000-0000-0000000000a1'
      and hm.role = 'owner'
      and hm.status = 'ACTIVE'
      and hm.joined_at is not null
  )
);

select test.set_auth('00000000-0000-0000-0000-0000000000b1', 'b@example.test');
select test.ok('User B same household cannot read A private movement', not exists(select 1 from public.movements where id = '60000000-0000-0000-0000-0000000000a1'));
select test.ok('User B active same household can read A shared movement', exists(select 1 from public.movements where id = '60000000-0000-0000-0000-0000000000a2'));
select test.ok('User B same household can read A shared fund', exists(select 1 from public.funds where id = '50000000-0000-0000-0000-0000000000a2'));
select test.ok('User B same household cannot read A private fund', not exists(select 1 from public.funds where id = '50000000-0000-0000-0000-0000000000a1'));
update public.funds
set name = 'B updated shared fund'
where id = '50000000-0000-0000-0000-0000000000a2';
select test.ok('User B same household cannot update A shared fund', exists(select 1 from public.funds where id = '50000000-0000-0000-0000-0000000000a2' and name = 'A shared fund'));

select test.set_auth('00000000-0000-0000-0000-0000000000c1', 'c@example.test');
select test.ok('User C other household cannot read A shared movement', not exists(select 1 from public.movements where id = '60000000-0000-0000-0000-0000000000a2'));
select test.ok('User C other household cannot read A shared fund', not exists(select 1 from public.funds where id = '50000000-0000-0000-0000-0000000000a2'));

select test.set_auth('00000000-0000-0000-0000-0000000000a1', 'a@example.test');
select test.denied('User A cannot share toward unauthorized household', $$
  insert into public.movements(owner_user_id, household_id, account_id, category_id, type, amount, occurred_on, shared_with_family)
  values ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000a1', 'expense', 1, current_date, true)
$$);
select test.denied('User A cannot use User B account', $$
  insert into public.movements(owner_user_id, account_id, category_id, type, amount, occurred_on)
  values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000a1', 'expense', 1, current_date)
$$);
select test.denied('User A cannot use User B fund', $$
  insert into public.movements(owner_user_id, fund_id, category_id, type, amount, occurred_on)
  values ('00000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000b1', '30000000-0000-0000-0000-0000000000a1', 'expense', 1, current_date)
$$);
select test.denied('User A cannot use User B category', $$
  insert into public.movements(owner_user_id, account_id, category_id, type, amount, occurred_on)
  values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', '30000000-0000-0000-0000-0000000000b1', 'expense', 1, current_date)
$$);
select test.denied('User A cannot self-add to arbitrary household', $$
  insert into public.household_members(household_id, user_id, role, status, joined_at)
  values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'owner', 'ACTIVE', now())
$$);
select test.denied('User A cannot modify owner_user_id', $$
  update public.movements
  set owner_user_id = '00000000-0000-0000-0000-0000000000b1'
  where id = '60000000-0000-0000-0000-0000000000a1'
$$);
select test.denied('User A cannot change household_id toward unauthorized household', $$
  update public.movements
  set household_id = '10000000-0000-0000-0000-000000000002', shared_with_family = true
  where id = '60000000-0000-0000-0000-0000000000a1'
$$);
select test.denied('Transfer with two sources is denied', $$
  insert into public.transfers(owner_user_id, from_account_id, from_fund_id, to_account_id, amount, occurred_on)
  values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000b1', 1, current_date)
$$);
select test.denied('Transfer without destination is denied', $$
  insert into public.transfers(owner_user_id, from_account_id, amount, occurred_on)
  values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', 1, current_date)
$$);

insert into public.balance_snapshots(owner_user_id, account_id, snapshot_date, balance)
values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', current_date, 10);
select test.denied('Snapshot duplicate account/date is denied', $$
  insert into public.balance_snapshots(owner_user_id, account_id, snapshot_date, balance)
  values ('00000000-0000-0000-0000-0000000000a1', '40000000-0000-0000-0000-0000000000a1', current_date, 11)
$$);

insert into public.budgets(owner_type, owner_user_id, month, amount)
values ('USER', '00000000-0000-0000-0000-0000000000a1', date_trunc('month', current_date)::date, 100);
select test.denied('Budget duplicate same scope is denied', $$
  insert into public.budgets(owner_type, owner_user_id, month, amount)
  values ('USER', '00000000-0000-0000-0000-0000000000a1', date_trunc('month', current_date)::date, 200)
$$);

rollback;
