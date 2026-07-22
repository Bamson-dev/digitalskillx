-- Certification hardening (run manually in Supabase SQL Editor after stability + security SQL).
-- Adds bulk row claim support + integrity helper views.

-- Allow 'processing' as a claim state for concurrent chunk workers.
alter table public.bulk_import_rows
  drop constraint if exists bulk_import_rows_status_check;

alter table public.bulk_import_rows
  add constraint bulk_import_rows_status_check
  check (status in ('pending', 'processing', 'created', 'enrolled', 'skipped', 'failed'));

-- Atomically claim a batch of pending CSV rows (FOR UPDATE SKIP LOCKED).
create or replace function public.claim_bulk_import_rows(p_job_id uuid, p_limit integer)
returns setof public.bulk_import_rows
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select r.id
    from public.bulk_import_rows r
    where r.job_id = p_job_id
      and r.status = 'pending'
    order by r.row_number
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 40), 200))
  )
  update public.bulk_import_rows r
  set status = 'processing'
  from picked
  where r.id = picked.id
  returning r.*;
end;
$$;

revoke all on function public.claim_bulk_import_rows(uuid, integer) from public;
grant execute on function public.claim_bulk_import_rows(uuid, integer) to service_role;

-- Integrity snapshot (read-only diagnostics).
create or replace view public.integrity_duplicate_enrollments as
select student_id, course_id, count(*) as cnt
from public.enrollments
group by student_id, course_id
having count(*) > 1;

create or replace view public.integrity_duplicate_transactions as
select reference, count(*) as cnt
from public.transactions
group by reference
having count(*) > 1;

create or replace view public.integrity_success_without_enrollment as
select t.id, t.reference, t.student_id, t.course_id, t.status, t.created_at
from public.transactions t
where t.status = 'success'
  and t.student_id is not null
  and not exists (
    select 1
    from public.enrollments e
    where e.student_id = t.student_id
      and e.course_id = t.course_id
  );

create or replace view public.integrity_orphan_progress as
select lp.id, lp.student_id, lp.lesson_id
from public.lesson_progress lp
where not exists (select 1 from public.profiles p where p.id = lp.student_id)
   or not exists (select 1 from public.lessons l where l.id = lp.lesson_id);

comment on function public.claim_bulk_import_rows is
  'Claim pending bulk_import_rows for concurrent-safe chunk processing.';
