create extension if not exists pgcrypto;

create type public.movement_type as enum ('income', 'expense', 'reimbursement');
create type public.account_type as enum ('cash', 'bank', 'credit_card');
create type public.fund_type as enum ('savings', 'holiday', 'emergency', 'deposit', 'custom');
create type public.household_role as enum ('owner', 'admin', 'member');
create type public.household_member_status as enum ('INVITED', 'ACTIVE', 'REMOVED');
create type public.household_invite_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');
create type public.resource_owner_type as enum ('USER', 'HOUSEHOLD');
create type public.fixed_expense_frequency as enum ('monthly', 'quarterly', 'yearly', 'custom');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
