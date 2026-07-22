-- Production stability: ensure all columns required by student/catalog/CSV paths exist.
-- Idempotent — safe to re-run.
-- After this file, also run sql/apply-production-security.sql in the SQL Editor.

-- 0024 course coming soon
alter table public.courses
  add column if not exists is_coming_soon boolean not null default false;

create index if not exists courses_coming_soon_idx
  on public.courses (is_coming_soon)
  where is_coming_soon = true;

comment on column public.courses.is_coming_soon is
  'When true, storefront shows a Coming Soon state and lesson access is blocked.';

drop policy if exists "enrollments: self-enroll open courses" on public.enrollments;
create policy "enrollments: self-enroll open courses" on public.enrollments
  for insert with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1 from public.courses c
      where c.id = course_id
        and c.enrollment_type = 'open'
        and c.visibility = 'published'
        and c.is_coming_soon = false
    )
  );

-- 0025 community links
alter table public.courses
  add column if not exists community_telegram_url text,
  add column if not exists community_whatsapp_url text;

comment on column public.courses.community_telegram_url is
  'Telegram group or channel invite link for enrolled students.';

comment on column public.courses.community_whatsapp_url is
  'WhatsApp community or group invite link for enrolled students.';

-- 0026 lesson coming soon
alter table public.lessons
  add column if not exists is_coming_soon boolean not null default false,
  add column if not exists coming_soon_available_at timestamptz;

create index if not exists lessons_coming_soon_idx
  on public.lessons (is_coming_soon)
  where is_coming_soon = true;

comment on column public.lessons.is_coming_soon is
  'When true, students see the lesson title but content shows a Coming Soon state.';

comment on column public.lessons.coming_soon_available_at is
  'Optional date shown to students for when lesson content is expected.';

-- 0023 milestone emails (safe if already applied)
alter table public.enrollments
  add column if not exists milestone_25_email_sent_at timestamptz,
  add column if not exists milestone_50_email_sent_at timestamptz,
  add column if not exists milestone_75_email_sent_at timestamptz;

-- 0021 certificate recipient
alter table public.certificates
  add column if not exists recipient_name text;
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
