-- Phase 2 Stage 1: Content Factory discovery foundation (additive only)
-- Admin/service-role only. No public read. Does not alter Phase 1 tables.

create table if not exists public.content_factory_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  topic text not null,
  target_generate integer not null default 20
    check (target_generate >= 1 and target_generate <= 50),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  discovered_count integer not null default 0,
  filtered_count integer not null default 0,
  qualified_count integer not null default 0,
  generated_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists content_factory_discovery_runs_status_idx
  on public.content_factory_discovery_runs (status, created_at desc);

create table if not exists public.content_factory_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.content_factory_discovery_runs (id) on delete cascade,
  playlist_id text not null,
  channel_id text,
  title text not null default '',
  channel_title text not null default '',
  item_count integer,
  thumbnail_url text,
  topic text not null default '',
  discovery_query text not null default '',
  status text not null default 'discovered'
    check (status in (
      'discovered', 'filtered', 'qualified', 'generating',
      'review', 'rejected', 'published', 'blocked'
    )),
  rule_score integer
    check (rule_score is null or (rule_score >= 0 and rule_score <= 85)),
  ai_score integer,
  score_breakdown jsonb not null default '{}'::jsonb,
  filter_reason text,
  learning_path_id uuid references public.learning_paths (id) on delete set null,
  factory_job_id uuid references public.content_factory_jobs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_factory_candidates_playlist_unique unique (playlist_id)
);

create index if not exists content_factory_candidates_run_status_idx
  on public.content_factory_candidates (run_id, status);

create index if not exists content_factory_candidates_topic_idx
  on public.content_factory_candidates (topic, created_at desc);

create index if not exists content_factory_candidates_channel_idx
  on public.content_factory_candidates (channel_id)
  where channel_id is not null;

create table if not exists public.content_factory_blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('playlist_id', 'channel_id')),
  value text not null,
  reason text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint content_factory_blocks_kind_value_unique unique (kind, value)
);

alter table public.content_factory_discovery_runs enable row level security;
alter table public.content_factory_candidates enable row level security;
alter table public.content_factory_blocks enable row level security;

drop policy if exists content_factory_discovery_runs_admin_all on public.content_factory_discovery_runs;
create policy content_factory_discovery_runs_admin_all on public.content_factory_discovery_runs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_factory_candidates_admin_all on public.content_factory_candidates;
create policy content_factory_candidates_admin_all on public.content_factory_candidates
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists content_factory_blocks_admin_all on public.content_factory_blocks;
create policy content_factory_blocks_admin_all on public.content_factory_blocks
  for all using (public.is_admin()) with check (public.is_admin());
