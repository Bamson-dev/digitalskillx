-- Bulk import production overhaul: phases, email outbox, reclaim stuck claims.
-- Idempotent. Run in Supabase SQL Editor after deploy.

-- Job progress phases (additive; safe if columns already exist)
alter table public.bulk_import_jobs
  add column if not exists phase text not null default 'queued',
  add column if not exists emails_queued integer not null default 0,
  add column if not exists emails_sent integer not null default 0,
  add column if not exists emails_failed integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists last_error text;

comment on column public.bulk_import_jobs.phase is
  'queued | processing_rows | sending_emails | completed | failed';

-- Track when a row was claimed so crashes can reclaim without relying on job.updated_at
alter table public.bulk_import_rows
  add column if not exists claimed_at timestamptz;

-- Durable email outbox (enrollment never depends on SMTP)
create table if not exists public.bulk_import_email_outbox (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.bulk_import_jobs(id) on delete cascade,
  row_id uuid references public.bulk_import_rows(id) on delete set null,
  student_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  course_title text,
  password_plain text,
  kind text not null default 'welcome'
    check (kind in ('welcome', 'enrollment_notice')),
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bulk_import_email_outbox_status_sched_idx
  on public.bulk_import_email_outbox (status, scheduled_at);

create index if not exists bulk_import_email_outbox_job_idx
  on public.bulk_import_email_outbox (job_id);

alter table public.bulk_import_email_outbox enable row level security;

-- Reclaim rows stuck in processing (crash / serverless timeout)
create or replace function public.reclaim_stale_bulk_import_rows(p_older_than_minutes integer default 10)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.bulk_import_rows r
  set status = 'pending',
      reason = null,
      claimed_at = null
  where r.status = 'processing'
    and coalesce(r.claimed_at, r.processed_at, now() - interval '1 hour')
        < now() - make_interval(mins => greatest(1, coalesce(p_older_than_minutes, 10)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.reclaim_stale_bulk_import_rows(integer) from public;
grant execute on function public.reclaim_stale_bulk_import_rows(integer) to service_role;

-- Update claim RPC to stamp claimed_at
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
    limit greatest(1, least(coalesce(p_limit, 15), 200))
  )
  update public.bulk_import_rows r
  set status = 'processing',
      claimed_at = now()
  from picked
  where r.id = picked.id
  returning r.*;
end;
$$;

revoke all on function public.claim_bulk_import_rows(uuid, integer) from public;
grant execute on function public.claim_bulk_import_rows(uuid, integer) to service_role;

-- Claim email outbox rows for drain workers
create or replace function public.claim_bulk_import_email_outbox(p_limit integer default 20)
returns setof public.bulk_import_email_outbox
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select o.id
    from public.bulk_import_email_outbox o
    where o.status = 'pending'
      and o.scheduled_at <= now()
    order by o.scheduled_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.bulk_import_email_outbox o
  set status = 'sending',
      attempts = o.attempts + 1,
      updated_at = now()
  from picked
  where o.id = picked.id
  returning o.*;
end;
$$;

revoke all on function public.claim_bulk_import_email_outbox(integer) from public;
grant execute on function public.claim_bulk_import_email_outbox(integer) to service_role;
