-- Stage 10: Organic Content Authority Engine
-- Additive only. DO NOT APPLY until explicitly authorized.
-- Stores supporting authority content linked to published learning paths.
-- Public SELECT is published-only. Admin ALL via is_admin().

create table if not exists public.authority_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null,
  content_type text not null,
  description text not null default '',
  body_md text not null default '',
  learning_path_id uuid references public.learning_paths (id) on delete set null,
  category text not null default '',
  target_intent text not null default '',
  target_audience text not null default '',
  related_lesson_ids uuid[] not null default '{}',
  related_lesson_titles text[] not null default '{}',
  seo_title text,
  seo_description text,
  status text not null default 'idea',
  quality_score integer,
  quality_breakdown jsonb not null default '{}'::jsonb,
  opportunity_score integer not null default 0,
  source_urls text[] not null default '{}',
  internal_links jsonb not null default '[]'::jsonb,
  generation_meta jsonb not null default '{}'::jsonb,
  word_count integer not null default 0,
  stale_at timestamptz,
  source_updated_at timestamptz,
  reviewed_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint authority_articles_slug_unique unique (slug),
  constraint authority_articles_content_type_check check (
    content_type in (
      'guide',
      'tutorial',
      'explainer',
      'study_notes',
      'lesson_summary',
      'faq',
      'glossary',
      'practical_example',
      'common_mistakes',
      'comparison',
      'prerequisites',
      'next_steps'
    )
  ),
  constraint authority_articles_status_check check (
    status in (
      'idea',
      'qualified',
      'generating',
      'review',
      'approved',
      'published',
      'rejected',
      'failed'
    )
  )
);

create index if not exists authority_articles_status_published_idx
  on public.authority_articles (status, published_at desc)
  where status = 'published';

create index if not exists authority_articles_path_idx
  on public.authority_articles (learning_path_id, status, updated_at desc);

create index if not exists authority_articles_type_status_idx
  on public.authority_articles (content_type, status, updated_at desc);

create index if not exists authority_articles_category_idx
  on public.authority_articles (category, status);

create unique index if not exists authority_articles_path_type_title_unique
  on public.authority_articles (learning_path_id, content_type, lower(title))
  where learning_path_id is not null;

alter table public.authority_articles enable row level security;

drop policy if exists authority_articles_admin_all on public.authority_articles;
create policy authority_articles_admin_all on public.authority_articles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists authority_articles_public_read_published on public.authority_articles;
create policy authority_articles_public_read_published on public.authority_articles
  for select using (status = 'published');
