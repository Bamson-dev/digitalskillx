-- Automated Library Build Engine (additive only)
-- Extends Content Factory with target-based discovery, coverage, and build orchestration.

-- Singleton settings row (id must be 'default')
create table if not exists public.library_build_settings (
  id text primary key default 'default' check (id = 'default'),
  target_published_count integer not null default 300
    check (target_published_count >= 1 and target_published_count <= 10000),
  build_mode text not null default 'bulk'
    check (build_mode in ('bulk', 'maintenance', 'expansion', 'paused', 'stopped')),
  run_status text not null default 'idle'
    check (run_status in ('idle', 'running', 'paused', 'stopped', 'completed')),
  quality_threshold integer not null default 60
    check (quality_threshold >= 0 and quality_threshold <= 100),
  discovery_jobs_per_day integer not null default 12
    check (discovery_jobs_per_day >= 1 and discovery_jobs_per_day <= 100),
  maintenance_max_per_week integer not null default 20
    check (maintenance_max_per_week >= 0 and maintenance_max_per_week <= 200),
  maintenance_enabled boolean not null default true,
  last_maintenance_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  stopped_at timestamptz,
  completed_at timestamptz,
  candidates_today integer not null default 0,
  approved_today integer not null default 0,
  published_today integer not null default 0,
  rejected_today integer not null default 0,
  jobs_started_today integer not null default 0,
  jobs_completed_today integer not null default 0,
  jobs_failed_today integer not null default 0,
  duplicates_blocked_total integer not null default 0,
  rejected_candidates_total integer not null default 0,
  failed_jobs_total integer not null default 0,
  stats_day date,
  next_topic_id uuid,
  last_job_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.library_build_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.library_build_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  active boolean not null default true,
  priority_weight integer not null default 50
    check (priority_weight >= 0 and priority_weight <= 100),
  minimum_coverage_goal integer not null default 5
    check (minimum_coverage_goal >= 0),
  preferred_target integer not null default 30
    check (preferred_target >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_build_categories_active_idx
  on public.library_build_categories (active, priority_weight desc, sort_order);

create table if not exists public.library_build_topics (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.library_build_categories (id) on delete cascade,
  name text not null,
  slug text not null,
  active boolean not null default true,
  priority_weight integer not null default 50
    check (priority_weight >= 0 and priority_weight <= 100),
  discovery_queries jsonb not null default '[]'::jsonb,
  approved_course_count integer not null default 0,
  published_course_count integer not null default 0,
  target_coverage integer not null default 5
    check (target_coverage >= 0),
  last_searched_at timestamptz,
  last_discovery_job_at timestamptz,
  last_published_at timestamptz,
  coverage_status text not null default 'unknown'
    check (coverage_status in ('unknown', 'needs_content', 'developing', 'good', 'strong', 'high_priority')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint library_build_topics_category_slug_unique unique (category_id, slug)
);

create index if not exists library_build_topics_priority_idx
  on public.library_build_topics (active, priority_weight desc, published_course_count);

create table if not exists public.library_build_discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'bulk'
    check (mode in ('bulk', 'maintenance', 'expansion')),
  category_id uuid references public.library_build_categories (id) on delete set null,
  topic_id uuid references public.library_build_topics (id) on delete set null,
  discovery_run_id uuid references public.content_factory_discovery_runs (id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'rate_limited', 'quota_limited', 'paused', 'cancelled')),
  search_queries jsonb not null default '[]'::jsonb,
  candidates_found integer not null default 0,
  candidates_rejected integer not null default 0,
  candidates_qualified integer not null default 0,
  candidates_duplicates integer not null default 0,
  candidates_approved integer not null default 0,
  courses_generated integer not null default 0,
  courses_published integer not null default 0,
  retry_count integer not null default 0,
  error_message text,
  sync_fingerprint text,
  synced_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_build_discovery_jobs_status_idx
  on public.library_build_discovery_jobs (status, created_at desc);

create index if not exists library_build_discovery_jobs_run_idx
  on public.library_build_discovery_jobs (discovery_run_id)
  where discovery_run_id is not null;

create table if not exists public.library_build_activity (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  message text not null default '',
  details jsonb not null default '{}'::jsonb,
  admin_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists library_build_activity_created_idx
  on public.library_build_activity (created_at desc);

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

-- Link discovery runs to library build topics (nullable for manual runs)
alter table public.content_factory_discovery_runs
  add column if not exists library_topic_id uuid references public.library_build_topics (id) on delete set null;

alter table public.content_factory_discovery_runs
  add column if not exists library_build_mode text
    check (library_build_mode is null or library_build_mode in ('bulk', 'maintenance', 'expansion', 'manual'));

create index if not exists content_factory_discovery_runs_library_topic_idx
  on public.content_factory_discovery_runs (library_topic_id)
  where library_topic_id is not null;

-- Pre-publish verification metadata on learning paths
alter table public.learning_paths
  add column if not exists verification_status text
    check (verification_status is null or verification_status in ('pending', 'passed', 'verification_failed', 'retry'));

alter table public.learning_paths
  add column if not exists verification_errors jsonb not null default '[]'::jsonb;

alter table public.learning_paths
  add column if not exists verification_checked_at timestamptz;

alter table public.learning_paths
  add column if not exists library_build_topic_id uuid references public.library_build_topics (id) on delete set null;

create index if not exists learning_paths_library_build_topic_idx
  on public.learning_paths (library_build_topic_id)
  where library_build_topic_id is not null;

-- Extend candidate quality fields (additive)
alter table public.content_factory_candidates
  add column if not exists quality_status text
    check (quality_status is null or quality_status in ('pending', 'qualified', 'rejected', 'blocked_duplicate', 'failed'));

alter table public.content_factory_candidates
  add column if not exists quality_reason text;

alter table public.content_factory_candidates
  add column if not exists rejection_reason text;

alter table public.content_factory_candidates
  add column if not exists final_quality_score integer
    check (final_quality_score is null or (final_quality_score >= 0 and final_quality_score <= 100));

alter table public.content_factory_candidates
  add column if not exists library_topic_id uuid references public.library_build_topics (id) on delete set null;

create index if not exists content_factory_candidates_quality_status_idx
  on public.content_factory_candidates (quality_status, created_at desc)
  where quality_status is not null;

create index if not exists content_factory_candidates_library_topic_idx
  on public.content_factory_candidates (library_topic_id)
  where library_topic_id is not null;

-- RLS: admin only
alter table public.library_build_settings enable row level security;
alter table public.library_build_categories enable row level security;
alter table public.library_build_topics enable row level security;
alter table public.library_build_discovery_jobs enable row level security;
alter table public.library_build_activity enable row level security;
alter table public.library_build_topic_courses enable row level security;

drop policy if exists library_build_settings_admin_all on public.library_build_settings;
create policy library_build_settings_admin_all on public.library_build_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists library_build_categories_admin_all on public.library_build_categories;
create policy library_build_categories_admin_all on public.library_build_categories
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists library_build_topics_admin_all on public.library_build_topics;
create policy library_build_topics_admin_all on public.library_build_topics
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists library_build_discovery_jobs_admin_all on public.library_build_discovery_jobs;
create policy library_build_discovery_jobs_admin_all on public.library_build_discovery_jobs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists library_build_activity_admin_all on public.library_build_activity;
create policy library_build_activity_admin_all on public.library_build_activity
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists library_build_topic_courses_admin_all on public.library_build_topic_courses;
create policy library_build_topic_courses_admin_all on public.library_build_topic_courses
  for all using (public.is_admin()) with check (public.is_admin());

-- Self-healing column adds:
-- CREATE TABLE IF NOT EXISTS is a no-op when an earlier partial 0051 already created
-- library_build_* tables without later columns. These ALTERs are idempotent.
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

alter table public.library_build_topics
  add column if not exists published_course_count integer not null default 0;
alter table public.library_build_topics
  add column if not exists target_coverage integer not null default 5;
alter table public.library_build_topics
  add column if not exists last_published_at timestamptz;

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

-- Ensure candidate quality_status check matches canonical statuses used by code.
alter table public.content_factory_candidates
  drop constraint if exists content_factory_candidates_quality_status_check;
alter table public.content_factory_candidates
  add constraint content_factory_candidates_quality_status_check
  check (
    quality_status is null
    or quality_status in ('pending', 'qualified', 'rejected', 'blocked_duplicate', 'failed')
  );
