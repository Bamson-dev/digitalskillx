-- Manual apply companion for 0040_platform_reliability.sql
-- Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

create index if not exists product_events_student_created_idx
  on public.product_events (student_id, created_at desc)
  where student_id is not null;

create index if not exists enrollments_idle_reminder_pending_idx
  on public.enrollments (enrolled_at)
  where completed_at is null and idle_reminder_sent_at is null;

create or replace function public.reclaim_stale_bulk_import_email_outbox(
  p_older_than_minutes integer default 15
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.bulk_import_email_outbox o
  set status = 'pending',
      updated_at = now(),
      last_error = coalesce(o.last_error, 'reclaimed_stale_sending')
  where o.status = 'sending'
    and o.updated_at < now() - make_interval(mins => greatest(1, coalesce(p_older_than_minutes, 15)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.reclaim_stale_bulk_import_email_outbox(integer) from public;
grant execute on function public.reclaim_stale_bulk_import_email_outbox(integer) to service_role;
