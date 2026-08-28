create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  source_filename text not null,
  imported_rows integer not null default 0 check (imported_rows >= 0),
  created_at timestamptz not null default now(),
  constraint import_batches_source_filename_not_blank check (length(trim(source_filename)) > 0)
);

create index import_batches_owner_idx on public.import_batches(owner_user_id);
