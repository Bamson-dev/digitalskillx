-- Additive patch for partial 0051 applies.
-- Safe to run multiple times. Does NOT drop or delete data.
-- CREATE TABLE IF NOT EXISTS does not add columns to existing tables;
-- this patch closes that gap for production Library Build Engine.

-- Settings counters (may be missing on early 0051 drafts)
alter table public.library_build_settings
  add column if not exists jobs_started_today integer not null default 0;
alter table public.library_build_settings
  add column if not exists jobs_completed_today integer not null default 0;
alter table public.library_build_settings
  add column if not exists jobs_failed_today integer not null default 0;
alter table public.library_build_settings
  add column if not exists duplicates_blocked_total integer not null default 0;
alter table public.library_build_settings
  add column if not exists rejected_candidates_total integer not null default 0;
alter table public.library_build_settings
  add column if not exists failed_jobs_total integer not null default 0;

-- Topic coverage columns
alter table public.library_build_topics
  add column if not exists published_course_count integer not null default 0;
alter table public.library_build_topics
  add column if not exists target_coverage integer not null default 5;
alter table public.library_build_topics
  add column if not exists last_published_at timestamptz;

-- Discovery job sync / result columns
alter table public.library_build_discovery_jobs
  add column if not exists candidates_qualified integer not null default 0;
alter table public.library_build_discovery_jobs
  add column if not exists candidates_duplicates integer not null default 0;
alter table public.library_build_discovery_jobs
  add column if not exists courses_generated integer not null default 0;
alter table public.library_build_discovery_jobs
  add column if not exists courses_published integer not null default 0;
alter table public.library_build_discovery_jobs
  add column if not exists sync_fingerprint text;
alter table public.library_build_discovery_jobs
  add column if not exists synced_at timestamptz;

-- Canonical course ↔ topic relationships
create table if not exists public.library_build_topic_courses (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  topic_id uuid not null references public.library_build_topics (id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  constraint library_build_topic_courses_path_topic_unique unique (learning_path_id, topic_id)
);

create unique index if not exists library_build_topic_courses_primary_unique
  on public.library_build_topic_courses (learning_path_id)
  where is_primary = true;

create index if not exists library_build_topic_courses_topic_idx
  on public.library_build_topic_courses (topic_id);

alter table public.library_build_topic_courses enable row level security;
drop policy if exists library_build_topic_courses_admin_all on public.library_build_topic_courses;
create policy library_build_topic_courses_admin_all on public.library_build_topic_courses
  for all using (public.is_admin()) with check (public.is_admin());

-- Existing table extensions
alter table public.content_factory_discovery_runs
  add column if not exists library_topic_id uuid references public.library_build_topics (id) on delete set null;
alter table public.content_factory_discovery_runs
  add column if not exists library_build_mode text;

alter table public.learning_paths
  add column if not exists verification_status text;
alter table public.learning_paths
  add column if not exists verification_errors jsonb not null default '[]'::jsonb;
alter table public.learning_paths
  add column if not exists verification_checked_at timestamptz;
alter table public.learning_paths
  add column if not exists library_build_topic_id uuid references public.library_build_topics (id) on delete set null;

alter table public.content_factory_candidates
  add column if not exists quality_status text;
alter table public.content_factory_candidates
  add column if not exists quality_reason text;
alter table public.content_factory_candidates
  add column if not exists rejection_reason text;
alter table public.content_factory_candidates
  add column if not exists final_quality_score integer;
alter table public.content_factory_candidates
  add column if not exists library_topic_id uuid references public.library_build_topics (id) on delete set null;

insert into public.library_build_settings (id)
values ('default')
on conflict (id) do nothing;
