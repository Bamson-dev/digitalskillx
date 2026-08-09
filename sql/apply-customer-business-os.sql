-- Manual apply companion for 0039_customer_business_os.sql

create table if not exists public.tag_catalog (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  label text not null,
  color text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tag_catalog_slug_uq unique (slug),
  constraint tag_catalog_label_len check (char_length(label) between 1 and 80),
  constraint tag_catalog_slug_len check (char_length(slug) between 1 and 80)
);

create index if not exists tag_catalog_label_idx on public.tag_catalog (lower(label));

alter table public.tag_catalog enable row level security;
drop policy if exists tag_catalog_admin_all on public.tag_catalog;
create policy tag_catalog_admin_all on public.tag_catalog
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.customer_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  definition jsonb not null default '{"logic":"and","rules":[]}'::jsonb,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_segments_name_len check (char_length(name) between 1 and 120)
);

create index if not exists customer_segments_updated_idx
  on public.customer_segments (updated_at desc);

alter table public.customer_segments enable row level security;
drop policy if exists customer_segments_admin_all on public.customer_segments;
create policy customer_segments_admin_all on public.customer_segments
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.course_bundles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_ngn integer not null default 0 check (price_ngn >= 0),
  price_usd numeric(10,2) not null default 0 check (price_usd >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_bundles_title_len check (char_length(title) between 1 and 200)
);

create table if not exists public.course_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.course_bundles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  sort_order integer not null default 0,
  constraint course_bundle_items_uq unique (bundle_id, course_id)
);

create index if not exists course_bundle_items_bundle_idx
  on public.course_bundle_items (bundle_id, sort_order);

alter table public.course_bundles enable row level security;
alter table public.course_bundle_items enable row level security;

drop policy if exists course_bundles_admin_all on public.course_bundles;
create policy course_bundles_admin_all on public.course_bundles
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists course_bundle_items_admin_all on public.course_bundle_items;
create policy course_bundle_items_admin_all on public.course_bundle_items
  for all using (public.is_admin()) with check (public.is_admin());

create index if not exists profiles_role_created_idx
  on public.profiles (role, created_at desc);

create index if not exists profiles_role_last_active_idx
  on public.profiles (role, last_active_at desc nulls last);

create index if not exists transactions_status_created_idx
  on public.transactions (status, created_at desc);

create index if not exists transactions_student_status_idx
  on public.transactions (student_id, status)
  where student_id is not null;

create index if not exists enrollments_student_enrolled_idx
  on public.enrollments (student_id, enrolled_at desc);

create index if not exists admin_notes_student_created_idx
  on public.admin_notes (student_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'automation_trigger' and e.enumlabel = 'customer_purchased'
  ) then
    alter type public.automation_trigger add value 'customer_purchased';
  end if;
exception
  when undefined_object then null;
end $$;
