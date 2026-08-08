-- Sales Page Phase 1 — apply in PRODUCTION Supabase SQL Editor if not already applied.
-- Source of truth: supabase/migrations/0036_sales_pages.sql
-- Idempotent (safe to re-run).

do $$ begin
  create type public.sales_page_status as enum ('draft', 'published', 'unpublished');
exception when duplicate_object then null;
end $$;

create table if not exists public.sales_pages (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null default '',
  status public.sales_page_status not null default 'draft',
  draft_schema jsonb not null default '{"version":1,"sections":[],"settings":{}}'::jsonb,
  published_schema jsonb,
  draft_version integer not null default 1,
  published_version integer not null default 0,
  seo jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint sales_pages_course_unique unique (course_id),
  constraint sales_pages_draft_version_pos check (draft_version > 0),
  constraint sales_pages_published_version_nonneg check (published_version >= 0)
);

create index if not exists sales_pages_status_idx on public.sales_pages (status);
create index if not exists sales_pages_course_id_idx on public.sales_pages (course_id);

create table if not exists public.sales_page_assets (
  id uuid primary key default gen_random_uuid(),
  sales_page_id uuid not null references public.sales_pages (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  filename text not null,
  original_filename text not null default '',
  mime_type text not null,
  size_bytes bigint not null default 0,
  storage_provider text not null default 'local',
  storage_path text not null,
  public_url text,
  checksum text,
  source_url text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_page_assets_size_nonneg check (size_bytes >= 0),
  constraint sales_page_assets_status_check check (
    status in ('active', 'missing', 'failed', 'deleted')
  )
);

create index if not exists sales_page_assets_page_idx on public.sales_page_assets (sales_page_id);
create index if not exists sales_page_assets_course_idx on public.sales_page_assets (course_id);
create index if not exists sales_page_assets_checksum_idx
  on public.sales_page_assets (checksum) where checksum is not null;

create table if not exists public.sales_page_imports (
  id uuid primary key default gen_random_uuid(),
  sales_page_id uuid not null references public.sales_pages (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  source_type text not null,
  source_format text not null default 'unknown',
  status text not null default 'pending',
  report jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint sales_page_imports_source_type_check check (source_type in ('json', 'zip')),
  constraint sales_page_imports_status_check check (
    status in ('pending', 'processing', 'completed', 'failed')
  )
);

create index if not exists sales_page_imports_page_idx
  on public.sales_page_imports (sales_page_id, created_at desc);
create index if not exists sales_page_imports_course_idx
  on public.sales_page_imports (course_id, created_at desc);

alter table public.sales_pages enable row level security;
alter table public.sales_page_assets enable row level security;
alter table public.sales_page_imports enable row level security;

drop policy if exists sales_pages_admin_all on public.sales_pages;
create policy sales_pages_admin_all on public.sales_pages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sales_page_assets_admin_all on public.sales_page_assets;
create policy sales_page_assets_admin_all on public.sales_page_assets
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sales_page_imports_admin_all on public.sales_page_imports;
create policy sales_page_imports_admin_all on public.sales_page_imports
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists sales_pages_public_read_published on public.sales_pages;
create policy sales_pages_public_read_published on public.sales_pages
  for select using (status = 'published');

drop policy if exists sales_page_assets_public_read on public.sales_page_assets;
create policy sales_page_assets_public_read on public.sales_page_assets
  for select using (
    status = 'active'
    and exists (
      select 1 from public.sales_pages sp
      where sp.id = sales_page_id and sp.status = 'published'
    )
  );

select 'sales_pages migration applied (idempotent)' as status;
