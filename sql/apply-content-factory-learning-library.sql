-- Phase 1: Free Learning Library + Content Factory (additive only)
-- Isolated from courses/enrollments/payments. Draft content never public.

-- ── Creators ────────────────────────────────────────────────────
create table if not exists public.creator_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  short_bio text not null default '',
  expertise text[] not null default '{}',
  teaches text not null default '',
  credentials text not null default '',
  relevance text not null default '',
  youtube_channel_id text,
  youtube_channel_url text,
  avatar_url text,
  research_status text not null default 'pending'
    check (research_status in ('pending', 'complete', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creator_profiles_channel_idx
  on public.creator_profiles (youtube_channel_id)
  where youtube_channel_id is not null;

create table if not exists public.creator_sources (
  id uuid primary key default gen_random_uuid(),
  creator_profile_id uuid not null references public.creator_profiles (id) on delete cascade,
  source_type text not null
    check (source_type in (
      'youtube_channel', 'website', 'linkedin', 'x', 'other', 'ai_synthesis'
    )),
  source_url text not null,
  source_title text not null default '',
  source_identifier text,
  relationship text not null default 'supporting',
  research_status text not null default 'retrieved',
  retrieved_at timestamptz not null default now()
);

create index if not exists creator_sources_creator_idx
  on public.creator_sources (creator_profile_id);

-- ── Learning paths ──────────────────────────────────────────────
create table if not exists public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  title text not null,
  description text not null default '',
  short_description text not null default '',
  creator_profile_id uuid references public.creator_profiles (id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'rejected', 'archived')),
  category text not null default '',
  difficulty text not null default 'beginner'
    check (difficulty in ('beginner', 'intermediate', 'advanced')),
  tags text[] not null default '{}',
  learning_objectives text[] not null default '{}',
  quality_score integer
    check (quality_score is null or (quality_score >= 0 and quality_score <= 100)),
  quality_breakdown jsonb not null default '{}'::jsonb,
  artwork_storage_path text,
  artwork_public_url text,
  source_playlist_id text,
  source_playlist_url text,
  source_playlist_title text,
  youtube_channel_id text,
  quiz_json jsonb not null default '[]'::jsonb,
  assessment_json jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  seo_title text,
  seo_description text,
  published_course_id uuid references public.courses (id) on delete set null,
  factory_job_id uuid,
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_paths_slug_unique unique (slug)
);

create index if not exists learning_paths_status_idx
  on public.learning_paths (status, updated_at desc);

create index if not exists learning_paths_published_slug_idx
  on public.learning_paths (slug)
  where status = 'published';

create index if not exists learning_paths_playlist_idx
  on public.learning_paths (source_playlist_id)
  where source_playlist_id is not null;

create table if not exists public.learning_path_sections (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  title text not null,
  position integer not null default 0,
  unique (learning_path_id, position)
);

create index if not exists learning_path_sections_path_idx
  on public.learning_path_sections (learning_path_id, position);

create table if not exists public.learning_path_lessons (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  section_id uuid references public.learning_path_sections (id) on delete set null,
  title text not null,
  original_title text not null default '',
  youtube_video_id text not null,
  youtube_url text not null,
  summary text not null default '',
  learning_objectives text[] not null default '{}',
  thumbnail_url text,
  duration_seconds integer,
  position integer not null default 0,
  source_metadata jsonb not null default '{}'::jsonb,
  unique (learning_path_id, youtube_video_id)
);

create index if not exists learning_path_lessons_path_idx
  on public.learning_path_lessons (learning_path_id, position);

create table if not exists public.learning_path_sources (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  source_type text not null
    check (source_type in (
      'youtube_playlist', 'youtube_video', 'youtube_channel', 'website', 'other'
    )),
  source_url text not null,
  source_title text not null default '',
  source_identifier text,
  relationship text not null default 'primary',
  retrieved_at timestamptz not null default now()
);

create index if not exists learning_path_sources_path_idx
  on public.learning_path_sources (learning_path_id);

-- ── Content Factory jobs ────────────────────────────────────────
create table if not exists public.content_factory_jobs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  input_type text not null
    check (input_type in ('topic', 'playlist_url', 'playlist_id')),
  input_value text not null,
  status text not null default 'pending'
    check (status in (
      'pending', 'processing', 'waiting_review', 'completed', 'failed', 'cancelled'
    )),
  phase text not null default 'queued'
    check (phase in (
      'queued', 'youtube', 'creator_research', 'ai_structure', 'ai_copy',
      'ai_quiz', 'artwork', 'quality', 'waiting_review', 'done', 'failed'
    )),
  progress integer not null default 0
    check (progress >= 0 and progress <= 100),
  learning_path_id uuid references public.learning_paths (id) on delete set null,
  error_message text,
  last_error text,
  attempts integer not null default 0,
  result_snapshot jsonb not null default '{}'::jsonb,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists content_factory_jobs_status_idx
  on public.content_factory_jobs (status, created_at asc);

create index if not exists content_factory_jobs_admin_idx
  on public.content_factory_jobs (admin_id, created_at desc);

alter table public.learning_paths
  drop constraint if exists learning_paths_factory_job_fkey;

do $$ begin
  alter table public.learning_paths
    add constraint learning_paths_factory_job_fkey
    foreign key (factory_job_id) references public.content_factory_jobs (id) on delete set null;
exception when duplicate_object then null;
end $$;

-- ── RLS ─────────────────────────────────────────────────────────
alter table public.creator_profiles enable row level security;
alter table public.creator_sources enable row level security;
alter table public.learning_paths enable row level security;
alter table public.learning_path_sections enable row level security;
alter table public.learning_path_lessons enable row level security;
alter table public.learning_path_sources enable row level security;
alter table public.content_factory_jobs enable row level security;

drop policy if exists creator_profiles_admin_all on public.creator_profiles;
create policy creator_profiles_admin_all on public.creator_profiles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists creator_profiles_public_read on public.creator_profiles;
create policy creator_profiles_public_read on public.creator_profiles
  for select using (
    exists (
      select 1 from public.learning_paths lp
      where lp.creator_profile_id = id and lp.status = 'published'
    )
  );

drop policy if exists creator_sources_admin_all on public.creator_sources;
create policy creator_sources_admin_all on public.creator_sources
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists learning_paths_admin_all on public.learning_paths;
create policy learning_paths_admin_all on public.learning_paths
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists learning_paths_public_read_published on public.learning_paths;
create policy learning_paths_public_read_published on public.learning_paths
  for select using (status = 'published');

drop policy if exists learning_path_sections_admin_all on public.learning_path_sections;
create policy learning_path_sections_admin_all on public.learning_path_sections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists learning_path_sections_public_read on public.learning_path_sections;
create policy learning_path_sections_public_read on public.learning_path_sections
  for select using (
    exists (
      select 1 from public.learning_paths lp
      where lp.id = learning_path_id and lp.status = 'published'
    )
  );

drop policy if exists learning_path_lessons_admin_all on public.learning_path_lessons;
create policy learning_path_lessons_admin_all on public.learning_path_lessons
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists learning_path_lessons_public_read on public.learning_path_lessons;
create policy learning_path_lessons_public_read on public.learning_path_lessons
  for select using (
    exists (
      select 1 from public.learning_paths lp
      where lp.id = learning_path_id and lp.status = 'published'
    )
  );

drop policy if exists learning_path_sources_admin_all on public.learning_path_sources;
create policy learning_path_sources_admin_all on public.learning_path_sources
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists learning_path_sources_public_read on public.learning_path_sources;
create policy learning_path_sources_public_read on public.learning_path_sources
  for select using (
    exists (
      select 1 from public.learning_paths lp
      where lp.id = learning_path_id and lp.status = 'published'
    )
  );

drop policy if exists content_factory_jobs_admin_all on public.content_factory_jobs;
create policy content_factory_jobs_admin_all on public.content_factory_jobs
  for all using (public.is_admin()) with check (public.is_admin());

-- Claim pending factory jobs (service role / cron)
create or replace function public.claim_content_factory_jobs(p_limit integer default 1)
returns setof public.content_factory_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.content_factory_jobs j
    where j.status = 'pending'
    order by j.created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1), 5))
  )
  update public.content_factory_jobs j
  set status = 'processing',
      phase = case when j.phase = 'queued' then 'youtube' else j.phase end,
      started_at = coalesce(j.started_at, now()),
      claimed_at = now(),
      attempts = j.attempts + 1,
      updated_at = now()
  from picked
  where j.id = picked.id
  returning j.*;
end;
$$;

revoke all on function public.claim_content_factory_jobs(integer) from public;
grant execute on function public.claim_content_factory_jobs(integer) to service_role;
