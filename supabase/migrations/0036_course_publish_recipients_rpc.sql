-- Fast recipient lookup for course publish notifications (see lib/announcement-recipients.ts).

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
