do $$
begin
  if not exists (
    select 1
    from public.movements
    where deleted_at is null
      and fixed_expense_id is not null
    group by owner_user_id, fixed_expense_id, occurred_on
    having count(*) > 1
  ) then
    create unique index if not exists movements_fixed_expense_occurrence_idx
      on public.movements(owner_user_id, fixed_expense_id, occurred_on)
      where deleted_at is null and fixed_expense_id is not null;
  end if;
end $$;
