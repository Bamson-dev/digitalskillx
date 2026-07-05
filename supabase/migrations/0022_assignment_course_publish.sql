-- Course-level assignments, draft/publish workflow, and publish delivery log.

do $$ begin
  create type public.assignment_status as enum ('draft', 'published');
exception
  when duplicate_object then null;
end $$;

alter type public.notification_type add value if not exists 'assignment_published';

alter table public.assignments
  add column if not exists course_id uuid references public.courses (id) on delete cascade,
  add column if not exists status public.assignment_status not null default 'draft',
  add column if not exists published_at timestamptz;

update public.assignments a
set course_id = m.course_id
from public.modules m
where a.module_id = m.id
  and a.course_id is null;

-- Existing assignments were visible to enrolled students before publish states existed.
update public.assignments
set status = 'published',
    published_at = coalesce(published_at, created_at)
where course_id is not null;

alter table public.assignments
  alter column module_id drop not null;

alter table public.assignments
  alter column course_id set not null;

create or replace function public.assignments_validate_module_course()
returns trigger
language plpgsql
as $$
begin
  if new.module_id is not null then
    if not exists (
      select 1 from public.modules m
      where m.id = new.module_id and m.course_id = new.course_id
    ) then
      raise exception 'module_id must belong to course_id';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_validate_module_course on public.assignments;
create trigger assignments_validate_module_course
  before insert or update on public.assignments
  for each row execute function public.assignments_validate_module_course();

create table if not exists public.assignment_publish_deliveries (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id    uuid not null references public.profiles (id) on delete cascade,
  notified_at   timestamptz not null default now(),
  primary key (assignment_id, student_id)
);

create index if not exists assignments_course_status_idx
  on public.assignments (course_id, status);

alter table public.assignment_publish_deliveries enable row level security;

drop policy if exists "assignment_publish_deliveries: admin all" on public.assignment_publish_deliveries;
create policy "assignment_publish_deliveries: admin all" on public.assignment_publish_deliveries
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "assignments: read enrolled" on public.assignments;
create policy "assignments: read enrolled published" on public.assignments
  for select using (
    status = 'published'::public.assignment_status
    and public.is_enrolled(course_id)
  );
