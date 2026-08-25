-- Run in Supabase SQL Editor (production) if migration 0032 is not applied via CLI.
-- Program (category) students get notified when a new course in their program is published.

alter type public.notification_type add value if not exists 'program_course_added';

create table if not exists public.program_course_publish_deliveries (
  course_id   uuid not null references public.courses (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (course_id, student_id)
);

create index if not exists program_course_publish_deliveries_course_idx
  on public.program_course_publish_deliveries (course_id);

alter table public.program_course_publish_deliveries enable row level security;

drop policy if exists "program_course_publish_deliveries: admin all" on public.program_course_publish_deliveries;
create policy "program_course_publish_deliveries: admin all" on public.program_course_publish_deliveries
  for all using (public.is_admin()) with check (public.is_admin());

-- One-query recipient list for publish notifications (avoids scanning enrollments in app code).
create or replace function public.list_course_publish_recipients()
returns table (id uuid, email text, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.id, p.email, p.full_name
  from public.profiles p
  where p.role = 'student'
    and not p.is_suspended
    and p.email is not null
    and trim(p.email) <> ''
    and (
      exists (select 1 from public.enrollments e where e.student_id = p.id)
      or exists (
        select 1 from public.transactions t
        where t.student_id = p.id and t.status = 'success'
      )
    );
$$;

revoke all on function public.list_course_publish_recipients() from public;
grant execute on function public.list_course_publish_recipients() to service_role;
