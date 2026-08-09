-- Manual apply companion for 0038_sales_conversion_engine.sql
-- Safe to re-run (IF NOT EXISTS / drop policy if exists).

create index if not exists product_events_name_created_idx
  on public.product_events (event_name, created_at desc);

create index if not exists product_events_course_name_created_idx
  on public.product_events (course_id, event_name, created_at desc);

create table if not exists public.sales_page_leads (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  sales_page_id uuid references public.sales_pages (id) on delete set null,
  email text not null,
  full_name text,
  consent boolean not null default false,
  source text not null default 'sales_page',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_page_leads_email_len check (char_length(email) between 3 and 320),
  constraint sales_page_leads_course_email_uq unique (course_id, email)
);

create index if not exists sales_page_leads_course_created_idx
  on public.sales_page_leads (course_id, created_at desc);

alter table public.sales_page_leads enable row level security;

drop policy if exists sales_page_leads_admin_all on public.sales_page_leads;
create policy sales_page_leads_admin_all on public.sales_page_leads
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.course_recommendations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  recommended_course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null default 'cross_sell'
    check (kind in ('cross_sell', 'upsell', 'downsell', 'related')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_recommendations_no_self check (course_id <> recommended_course_id),
  constraint course_recommendations_unique unique (course_id, recommended_course_id, kind)
);

create index if not exists course_recommendations_course_idx
  on public.course_recommendations (course_id, sort_order)
  where active = true;

alter table public.course_recommendations enable row level security;

drop policy if exists course_recommendations_admin_all on public.course_recommendations;
create policy course_recommendations_admin_all on public.course_recommendations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists course_recommendations_public_read on public.course_recommendations;
create policy course_recommendations_public_read on public.course_recommendations
  for select using (active = true);
