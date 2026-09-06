-- Apply platform announcements (idempotent). Safe to re-run.

create table if not exists public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  type text not null default 'information'
    check (type in ('information', 'important', 'success', 'warning')),
  is_active boolean not null default true,
  is_fixed boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_announcements_window_check check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  )
);

create index if not exists platform_announcements_active_idx
  on public.platform_announcements (is_active, is_fixed desc, created_at desc);

create index if not exists platform_announcements_window_idx
  on public.platform_announcements (starts_at, ends_at)
  where is_active = true;

alter table public.platform_announcements enable row level security;

drop policy if exists platform_announcements_admin_all on public.platform_announcements;
create policy platform_announcements_admin_all
  on public.platform_announcements for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists platform_announcements_student_select on public.platform_announcements;
create policy platform_announcements_student_select
  on public.platform_announcements for select to authenticated
  using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );
