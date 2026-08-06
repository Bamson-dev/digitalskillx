-- Tear down Enrollment Link System objects from apply-enrollment-links.sql.
-- Safe to re-run. Does NOT remove 'enrollment_link' from enrollment_source
-- (Postgres cannot drop a single enum value once added).

drop function if exists public.claim_enrollment_link_redemption(
  uuid, uuid, text, text, text, text, text, text, text
);

drop table if exists public.enrollment_events cascade;
drop table if exists public.enrollment_link_redemptions cascade;
drop table if exists public.enrollment_link_courses cascade;
drop table if exists public.enrollment_links cascade;

drop type if exists public.enrollment_link_redirect;
drop type if exists public.enrollment_link_access;
drop type if exists public.enrollment_link_status;
