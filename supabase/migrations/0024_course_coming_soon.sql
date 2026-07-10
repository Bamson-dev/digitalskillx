-- Mark courses as "coming soon" when marketing pages are live but lessons are not recorded yet.

alter table public.courses
  add column if not exists is_coming_soon boolean not null default false;

create index if not exists courses_coming_soon_idx
  on public.courses (is_coming_soon)
  where is_coming_soon = true;

comment on column public.courses.is_coming_soon is
  'When true, storefront shows a Coming Soon state and lesson access is blocked.';

-- Block self-enrollment into coming-soon courses (admin enrollments still allowed).
drop policy if exists "enrollments: self-enroll open courses" on public.enrollments;
create policy "enrollments: self-enroll open courses" on public.enrollments
  for insert with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1 from public.courses c
      where c.id = course_id
        and c.enrollment_type = 'open'
        and c.visibility = 'published'
        and c.is_coming_soon = false
    )
  );
