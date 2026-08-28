alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_user_preferences enable row level security;
alter table public.household_invites enable row level security;
alter table public.macro_categories enable row level security;
alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.funds enable row level security;
alter table public.import_batches enable row level security;
alter table public.movements enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.fixed_expense_months enable row level security;
alter table public.budgets enable row level security;
alter table public.balance_snapshots enable row level security;
alter table public.audit_log enable row level security;
alter table public.transfers enable row level security;

create policy profiles_select_own on public.profiles
for select using (id = auth.uid());

create policy profiles_insert_own on public.profiles
for insert with check (id = auth.uid());

create policy profiles_update_own on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

create policy households_member_select on public.households
for select using (public.is_active_household_member(id, auth.uid()));

create policy households_insert_creator on public.households
for insert with check (created_by = auth.uid());

create policy households_update_admin on public.households
for update using (public.is_household_admin(id, auth.uid())) with check (public.is_household_admin(id, auth.uid()));

create policy household_members_select_active_household on public.household_members
for select using (public.is_active_household_member(household_id, auth.uid()));

create policy household_members_insert_creator_self_owner on public.household_members
for insert with check (
  user_id = auth.uid()
  and role = 'owner'
  and status = 'ACTIVE'
  and joined_at is not null
  and exists (
    select 1 from public.households h
    where h.id = household_members.household_id
      and h.created_by = auth.uid()
  )
);

create policy household_members_insert_admin_invite on public.household_members
for insert with check (
  user_id <> auth.uid()
  and role = 'member'
  and status = 'INVITED'
  and public.is_household_admin(household_id, auth.uid())
);

create policy household_members_update_admin on public.household_members
for update using (public.is_household_admin(household_id, auth.uid()))
with check (
  public.is_household_admin(household_id, auth.uid())
  and not (user_id = auth.uid() and role <> 'owner')
);

create policy household_user_preferences_select_own on public.household_user_preferences
for select using (
  user_id = auth.uid()
  and public.is_active_household_member(household_id, auth.uid())
);

create policy household_user_preferences_insert_own on public.household_user_preferences
for insert with check (
  user_id = auth.uid()
  and public.is_active_household_member(household_id, auth.uid())
);

create policy household_user_preferences_update_own on public.household_user_preferences
for update using (
  user_id = auth.uid()
  and public.is_active_household_member(household_id, auth.uid())
) with check (
  user_id = auth.uid()
  and public.is_active_household_member(household_id, auth.uid())
);

create policy household_invites_select_admin_or_invitee on public.household_invites
for select using (
  public.is_household_admin(household_id, auth.uid())
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy household_invites_insert_admin on public.household_invites
for insert with check (
  invited_by = auth.uid()
  and status = 'PENDING'
  and public.is_household_admin(household_id, auth.uid())
);

create policy household_invites_update_admin_non_accept on public.household_invites
for update using (public.is_household_admin(household_id, auth.uid()))
with check (
  public.is_household_admin(household_id, auth.uid())
  and status in ('PENDING', 'REJECTED', 'EXPIRED')
);

create policy macro_categories_select_accessible on public.macro_categories
for select using (
  owner_user_id = auth.uid()
  or public.is_active_household_member(household_id, auth.uid())
);

create policy macro_categories_insert_accessible on public.macro_categories
for insert with check (
  owner_user_id = auth.uid()
  or public.is_household_admin(household_id, auth.uid())
);

create policy macro_categories_update_accessible on public.macro_categories
for update using (
  owner_user_id = auth.uid()
  or public.is_household_admin(household_id, auth.uid())
) with check (
  owner_user_id = auth.uid()
  or public.is_household_admin(household_id, auth.uid())
);

create policy categories_select_accessible on public.categories
for select using (public.user_can_access_category(id, auth.uid(), null));

create policy categories_insert_accessible on public.categories
for insert with check (
  exists (
    select 1 from public.macro_categories mc
    where mc.id = categories.macro_category_id
      and (
        mc.owner_user_id = auth.uid()
        or public.is_household_admin(mc.household_id, auth.uid())
      )
  )
);

create policy categories_update_accessible on public.categories
for update using (public.user_can_access_category(id, auth.uid(), null))
with check (
  exists (
    select 1 from public.macro_categories mc
    where mc.id = categories.macro_category_id
      and (
        mc.owner_user_id = auth.uid()
        or public.is_household_admin(mc.household_id, auth.uid())
      )
  )
);

create policy accounts_owner_select on public.accounts
for select using (owner_user_id = auth.uid());

create policy accounts_owner_insert on public.accounts
for insert with check (owner_user_id = auth.uid());

create policy accounts_owner_update on public.accounts
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy funds_owner_select on public.funds
for select using (owner_user_id = auth.uid());

create policy funds_owner_insert on public.funds
for insert with check (owner_user_id = auth.uid());

create policy funds_owner_update on public.funds
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy import_batches_owner_select on public.import_batches
for select using (owner_user_id = auth.uid());

create policy import_batches_owner_insert on public.import_batches
for insert with check (owner_user_id = auth.uid());

create policy import_batches_owner_update on public.import_batches
for update using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create policy movements_owner_or_shared_select on public.movements
for select using (
  owner_user_id = auth.uid()
  or (
    shared_with_family = true
    and public.is_active_household_member(household_id, auth.uid())
  )
);

create policy movements_insert_owner_valid_refs on public.movements
for insert with check (
  public.movement_row_is_allowed(
    owner_user_id,
    household_id,
    shared_with_family,
    account_id,
    fund_id,
    category_id,
    type,
    reimbursement_for_movement_id,
    import_batch_id,
    auth.uid()
  )
);

create policy movements_update_owner_valid_refs on public.movements
for update using (owner_user_id = auth.uid())
with check (
  public.movement_row_is_allowed(
    owner_user_id,
    household_id,
    shared_with_family,
    account_id,
    fund_id,
    category_id,
    type,
    reimbursement_for_movement_id,
    import_batch_id,
    auth.uid()
  )
);

create policy fixed_expenses_owner_or_shared_select on public.fixed_expenses
for select using (
  owner_user_id = auth.uid()
  or (
    shared_with_family = true
    and public.is_active_household_member(household_id, auth.uid())
  )
);

create policy fixed_expenses_insert_owner_valid_refs on public.fixed_expenses
for insert with check (
  public.fixed_expense_row_is_allowed(
    owner_user_id,
    household_id,
    shared_with_family,
    account_id,
    fund_id,
    category_id,
    auth.uid()
  )
);

create policy fixed_expenses_update_owner_valid_refs on public.fixed_expenses
for update using (owner_user_id = auth.uid())
with check (
  public.fixed_expense_row_is_allowed(
    owner_user_id,
    household_id,
    shared_with_family,
    account_id,
    fund_id,
    category_id,
    auth.uid()
  )
);

create policy fixed_expense_months_select_accessible on public.fixed_expense_months
for select using (
  exists (
    select 1 from public.fixed_expenses fe
    where fe.id = fixed_expense_months.fixed_expense_id
      and (
        fe.owner_user_id = auth.uid()
        or (fe.shared_with_family = true and public.is_active_household_member(fe.household_id, auth.uid()))
      )
  )
);

create policy fixed_expense_months_owner_insert on public.fixed_expense_months
for insert with check (
  exists (
    select 1 from public.fixed_expenses fe
    where fe.id = fixed_expense_months.fixed_expense_id
      and fe.owner_user_id = auth.uid()
  )
);

create policy fixed_expense_months_owner_update on public.fixed_expense_months
for update using (
  exists (
    select 1 from public.fixed_expenses fe
    where fe.id = fixed_expense_months.fixed_expense_id
      and fe.owner_user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from public.fixed_expenses fe
    where fe.id = fixed_expense_months.fixed_expense_id
      and fe.owner_user_id = auth.uid()
  )
);

create policy budgets_select_accessible on public.budgets
for select using (
  owner_user_id = auth.uid()
  or public.is_active_household_member(household_id, auth.uid())
);

create policy budgets_insert_valid_scope on public.budgets
for insert with check (
  public.budget_row_is_allowed(owner_type, owner_user_id, household_id, macro_category_id, category_id, auth.uid())
);

create policy budgets_update_valid_scope on public.budgets
for update using (
  owner_user_id = auth.uid()
  or public.is_household_admin(household_id, auth.uid())
) with check (
  public.budget_row_is_allowed(owner_type, owner_user_id, household_id, macro_category_id, category_id, auth.uid())
);

create policy balance_snapshots_owner_select on public.balance_snapshots
for select using (
  owner_user_id = auth.uid()
  and public.user_can_access_account(account_id, auth.uid(), null)
  and public.user_can_access_fund(fund_id, auth.uid(), null)
);

create policy balance_snapshots_owner_insert on public.balance_snapshots
for insert with check (
  owner_user_id = auth.uid()
  and public.user_can_access_account(account_id, auth.uid(), null)
  and public.user_can_access_fund(fund_id, auth.uid(), null)
);

create policy balance_snapshots_owner_update on public.balance_snapshots
for update using (
  owner_user_id = auth.uid()
  and public.user_can_access_account(account_id, auth.uid(), null)
  and public.user_can_access_fund(fund_id, auth.uid(), null)
) with check (
  owner_user_id = auth.uid()
  and public.user_can_access_account(account_id, auth.uid(), null)
  and public.user_can_access_fund(fund_id, auth.uid(), null)
);

create policy transfers_owner_select on public.transfers
for select using (owner_user_id = auth.uid());

create policy transfers_insert_valid_refs on public.transfers
for insert with check (
  public.transfer_row_is_allowed(owner_user_id, household_id, from_account_id, to_account_id, from_fund_id, to_fund_id, auth.uid())
);

create policy transfers_update_valid_refs on public.transfers
for update using (owner_user_id = auth.uid())
with check (
  public.transfer_row_is_allowed(owner_user_id, household_id, from_account_id, to_account_id, from_fund_id, to_fund_id, auth.uid())
);

create policy audit_log_select_authorized on public.audit_log
for select using (
  actor_user_id = auth.uid()
  or public.is_active_household_member(household_id, auth.uid())
);
