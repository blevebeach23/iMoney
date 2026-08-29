alter table public.fixed_expenses
add column if not exists day_of_month integer not null default 1 check (day_of_month between 1 and 31),
add column if not exists active_months integer[] not null default array[1,2,3,4,5,6,7,8,9,10,11,12];

alter table public.fixed_expenses
add constraint fixed_expenses_active_months_valid check (
  active_months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]
  and cardinality(active_months) > 0
);

alter table public.movements
add column if not exists fixed_expense_id uuid references public.fixed_expenses(id) on delete set null;

create index if not exists movements_fixed_expense_idx
  on public.movements(fixed_expense_id)
  where fixed_expense_id is not null;
