-- Sales Page Phase 2 — version history (additive only)

create table if not exists public.sales_page_versions (
  id uuid primary key default gen_random_uuid(),
  sales_page_id uuid not null references public.sales_pages (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  version integer not null,
  schema jsonb not null default '{"version":1,"sections":[],"settings":{}}'::jsonb,
  seo jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint sales_page_versions_version_pos check (version > 0)
);

create index if not exists sales_page_versions_page_idx
  on public.sales_page_versions (sales_page_id, created_at desc);

create index if not exists sales_page_versions_course_idx
  on public.sales_page_versions (course_id, created_at desc);

alter table public.sales_page_versions enable row level security;

drop policy if exists sales_page_versions_admin_all on public.sales_page_versions;
create policy sales_page_versions_admin_all on public.sales_page_versions
  for all using (public.is_admin()) with check (public.is_admin());
