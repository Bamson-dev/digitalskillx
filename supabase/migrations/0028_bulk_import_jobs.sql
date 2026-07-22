-- Chunked bulk student CSV import jobs (production-scale buyer uploads).

create table if not exists public.bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  default_course_id uuid references public.courses(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  created_count integer not null default 0,
  enrolled_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bulk_import_jobs(id) on delete cascade,
  row_number integer not null,
  full_name text not null default '',
  email text not null default '',
  course_ref text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'created', 'enrolled', 'skipped', 'failed')),
  reason text,
  password_plain text,
  processed_at timestamptz,
  unique (job_id, row_number)
);

create index if not exists bulk_import_rows_job_status_idx
  on public.bulk_import_rows (job_id, status);

create index if not exists bulk_import_jobs_admin_idx
  on public.bulk_import_jobs (admin_id, created_at desc);

alter table public.bulk_import_jobs enable row level security;
alter table public.bulk_import_rows enable row level security;

-- Service role / admin API uses service key; no public policies needed.
drop policy if exists "bulk_import_jobs: admin read" on public.bulk_import_jobs;
drop policy if exists "bulk_import_rows: admin read" on public.bulk_import_rows;
