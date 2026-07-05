-- Run only if assignment columns exist but drafts are still visible to students.
-- (Full migration: sql/assignment-course-publish.sql)

drop policy if exists "assignments: read enrolled" on public.assignments;
drop policy if exists "assignments: read enrolled published" on public.assignments;

create policy "assignments: read enrolled published" on public.assignments
  for select using (
    status = 'published'::public.assignment_status
    and public.is_enrolled(course_id)
  );
