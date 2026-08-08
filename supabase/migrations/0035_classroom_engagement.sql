-- Classroom engagement toggles + lightweight product funnel events (Experience 2.0 G–J / companion).

alter table public.courses
  add column if not exists companion_enabled boolean not null default true;

alter table public.courses
  add column if not exists celebrations_enabled boolean not null default true;

comment on column public.courses.companion_enabled is
  'When false, hide the DigitalSkillX classroom companion for this course.';
comment on column public.courses.celebrations_enabled is
  'When false, suppress milestone/celebration motion for this course.';

create table if not exists public.product_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_name text not null,
  course_id uuid references public.courses (id) on delete set null,
  student_id uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists product_events_created_at_idx on public.product_events (created_at desc);
create index if not exists product_events_name_idx on public.product_events (event_name);
create index if not exists product_events_course_id_idx on public.product_events (course_id);

alter table public.product_events enable row level security;

-- Students may insert their own funnel events; admins may read.
drop policy if exists product_events_insert_own on public.product_events;
create policy product_events_insert_own
  on public.product_events
  for insert
  to authenticated
  with check (
    student_id is null
    or student_id = auth.uid()
  );

drop policy if exists product_events_admin_select on public.product_events;
create policy product_events_admin_select
  on public.product_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
