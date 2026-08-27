-- Fix production quality_status check constraint for Library Build qualify path.
-- Safe / additive. No data deletion.
--
-- Root cause:
-- An earlier partial 0051 created content_factory_candidates.quality_status with a
-- CHECK that does not allow 'qualified' (and possibly 'blocked_duplicate' / 'failed').
-- Discovery can write pending/rejected, but AI qualification fails when writing
-- quality_status = 'qualified', which stalls Library Build runs.
--
-- Evidence from production discovery run 2692126b-5a03-42c5-8cc2-c00d01582399:
--   violates check constraint "content_factory_candidates_quality_status_check"

alter table public.content_factory_candidates
  drop constraint if exists content_factory_candidates_quality_status_check;

alter table public.content_factory_candidates
  add constraint content_factory_candidates_quality_status_check
  check (
    quality_status is null
    or quality_status in ('pending', 'qualified', 'rejected', 'blocked_duplicate', 'failed')
  );

-- Allow stuck running discovery runs blocked by this constraint to be retried by cron.
-- Does not delete candidates or courses.
update public.content_factory_discovery_runs
set
  error_message = null,
  updated_at = now()
where status = 'running'
  and error_message ilike '%quality_status_check%';
