alter type public.notification_type add value if not exists 'future_expense_reminder';

create unique index if not exists notifications_dedupe_key_full_idx
on public.notifications(dedupe_key);

create index if not exists movements_future_expense_reminder_idx
on public.movements(occurred_on, created_at desc)
where deleted_at is null and type = 'expense';
