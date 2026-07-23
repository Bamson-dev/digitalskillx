-- =============================================================================
-- DigitalSkillX — RUN THIS IN SUPABASE SQL EDITOR (one paste is enough)
-- =============================================================================
-- Order is already correct. Idempotent — safe to re-run.
--
-- Source files (also available separately):
--   1) sql/apply-production-stability.sql
--   2) sql/apply-production-security.sql
--   3) sql/apply-certification-hardening.sql
-- =============================================================================


-- #############################################################################
-- PART 1 / 3 — Production stability
-- #############################################################################

-- Production stability: ensure all columns required by student/catalog/CSV paths exist.
-- Idempotent — safe to re-run.

-- 0024 course coming soon
alter table public.courses
  add column if not exists is_coming_soon boolean not null default false;

create index if not exists courses_coming_soon_idx
  on public.courses (is_coming_soon)
  where is_coming_soon = true;

comment on column public.courses.is_coming_soon is
  'When true, storefront shows a Coming Soon state and lesson access is blocked.';

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

-- 0025 community links
alter table public.courses
  add column if not exists community_telegram_url text,
  add column if not exists community_whatsapp_url text;

comment on column public.courses.community_telegram_url is
  'Telegram group or channel invite link for enrolled students.';

comment on column public.courses.community_whatsapp_url is
  'WhatsApp community or group invite link for enrolled students.';

-- 0026 lesson coming soon
alter table public.lessons
  add column if not exists is_coming_soon boolean not null default false,
  add column if not exists coming_soon_available_at timestamptz;

create index if not exists lessons_coming_soon_idx
  on public.lessons (is_coming_soon)
  where is_coming_soon = true;

comment on column public.lessons.is_coming_soon is
  'When true, students see the lesson title but content shows a Coming Soon state.';

comment on column public.lessons.coming_soon_available_at is
  'Optional date shown to students for when lesson content is expected.';

-- 0023 milestone emails (safe if already applied)
alter table public.enrollments
  add column if not exists milestone_25_email_sent_at timestamptz,
  add column if not exists milestone_50_email_sent_at timestamptz,
  add column if not exists milestone_75_email_sent_at timestamptz;

-- 0021 certificate recipient
alter table public.certificates
  add column if not exists recipient_name text;

-- Chunked bulk student CSV import jobs (production-scale buyer uploads).
create table if not exists public.bulk_import_jobs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  default_course_id uuid references public.courses(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed')),
  total_rows integer not null default 0,
  processed_rows integer not null default 0,
  created_count integer not null default 0,
  enrolled_count integer not null default 0,
  skipped_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bulk_import_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bulk_import_jobs(id) on delete cascade,
  row_number integer not null,
  full_name text not null default '',
  email text not null default '',
  course_ref text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'created', 'enrolled', 'skipped', 'failed')),
  reason text,
  password_plain text,
  processed_at timestamptz,
  unique (job_id, row_number)
);

create index if not exists bulk_import_rows_job_status_idx
  on public.bulk_import_rows (job_id, status);

create index if not exists bulk_import_jobs_admin_idx
  on public.bulk_import_jobs (admin_id, created_at desc);

alter table public.bulk_import_jobs enable row level security;
alter table public.bulk_import_rows enable row level security;

drop policy if exists "bulk_import_jobs: admin read" on public.bulk_import_jobs;
drop policy if exists "bulk_import_rows: admin read" on public.bulk_import_rows;


-- #############################################################################
-- PART 2 / 3 — Production security
-- #############################################################################

-- 1) Prevent students from escalating role / clearing suspension via client UPDATE.
create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      raise exception 'profiles.role cannot be changed by clients';
    end if;
    if new.is_suspended is distinct from old.is_suspended
       and not public.is_admin() then
      raise exception 'profiles.is_suspended cannot be changed by non-admins';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_privilege_escalation();

-- 2) Stop world-readable platform_settings (leaks cron_auth_secret → secret dump via RPC).
drop policy if exists "platform_settings: public read branding" on public.platform_settings;

drop policy if exists "platform_settings: admin all" on public.platform_settings;
create policy "platform_settings: admin all"
  on public.platform_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Safe public branding view (no cron_auth_secret).
create or replace view public.platform_branding
with (security_invoker = false)
as
select
  id,
  platform_name,
  logo_url,
  favicon_url,
  primary_color,
  default_timezone,
  email_sender_name,
  email_reply_to,
  default_certificate_template_id,
  default_certificate_template_key,
  updated_at
from public.platform_settings
where id = 'default';

grant select on public.platform_branding to anon, authenticated;

comment on view public.platform_branding is
  'Public branding fields only. Never expose cron_auth_secret.';

-- 4) Self-enroll RLS: only free published courses (blocks paid bypass via client INSERT).
drop policy if exists "enrollments: self-enroll open courses" on public.enrollments;
create policy "enrollments: self-enroll open courses"
  on public.enrollments
  for insert
  with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1
      from public.courses c
      where c.id = course_id
        and c.enrollment_type = 'open'
        and c.visibility = 'published'
        and coalesce(c.is_coming_soon, false) = false
        and coalesce(c.price_ngn, 0) <= 0
    )
  );


-- #############################################################################
-- PART 3 / 3 — Certification hardening
-- #############################################################################

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


-- =============================================================================
-- DONE — after this succeeds, optionally rotate CRON_SECRET / integration keys
-- if cron_auth_secret was ever exposed while platform_settings was public.
-- =============================================================================
