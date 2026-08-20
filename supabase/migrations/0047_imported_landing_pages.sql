-- Stage 11: URL-based landing page importer (additive only).
-- Does not alter sales_pages / WordPress JSON import tables.
-- Existing course sales pages remain as legacy schema-based pages.

do $$ begin
  create type public.imported_landing_page_status as enum (
    'importing',
    'imported',
    'review',
    'published',
    'failed',
    'archived'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.imported_landing_pages (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  source_url_normalized text not null,
  source_hash text,
  title text not null default '',
  slug text not null,
  status public.imported_landing_page_status not null default 'importing',
  destination_type text not null default 'course_checkout'
    check (destination_type in ('course_checkout', 'product_checkout', 'offer', 'internal_url')),
  destination_course_id uuid references public.courses (id) on delete set null,
  destination_product_id uuid,
  destination_offer_id uuid,
  destination_url text,
  draft_html text not null default '',
  published_html text,
  draft_css text not null default '',
  published_css text,
  page_metadata jsonb not null default '{}'::jsonb,
  cta_map jsonb not null default '[]'::jsonb,
  import_report jsonb not null default '{}'::jsonb,
  import_error text,
  version integer not null default 1 check (version > 0),
  imported_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint imported_landing_pages_slug_unique unique (slug),
  constraint imported_landing_pages_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80
  )
);

create index if not exists imported_landing_pages_status_idx
  on public.imported_landing_pages (status);
create index if not exists imported_landing_pages_source_norm_idx
  on public.imported_landing_pages (source_url_normalized);
create index if not exists imported_landing_pages_course_dest_idx
  on public.imported_landing_pages (destination_course_id);

create table if not exists public.imported_landing_page_assets (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.imported_landing_pages (id) on delete cascade,
  original_url text not null,
  storage_provider text not null default 'local',
  storage_path text not null,
  public_url text,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum text,
  status text not null default 'active'
    check (status in ('active', 'skipped', 'blocked', 'failed', 'deleted')),
  created_at timestamptz not null default now()
);

create index if not exists imported_landing_page_assets_page_idx
  on public.imported_landing_page_assets (page_id);

alter table public.imported_landing_pages enable row level security;
alter table public.imported_landing_page_assets enable row level security;

drop policy if exists imported_landing_pages_admin_all on public.imported_landing_pages;
create policy imported_landing_pages_admin_all on public.imported_landing_pages
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists imported_landing_pages_public_read_published on public.imported_landing_pages;
create policy imported_landing_pages_public_read_published on public.imported_landing_pages
  for select using (status = 'published');

drop policy if exists imported_landing_page_assets_admin_all on public.imported_landing_page_assets;
create policy imported_landing_page_assets_admin_all on public.imported_landing_page_assets
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists imported_landing_page_assets_public_read on public.imported_landing_page_assets;
create policy imported_landing_page_assets_public_read on public.imported_landing_page_assets
  for select using (
    status = 'active'
    and exists (
      select 1 from public.imported_landing_pages p
      where p.id = page_id and p.status = 'published'
    )
  );

create or replace function public.set_imported_landing_pages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists imported_landing_pages_set_updated_at on public.imported_landing_pages;
create trigger imported_landing_pages_set_updated_at
  before update on public.imported_landing_pages
  for each row execute function public.set_imported_landing_pages_updated_at();
