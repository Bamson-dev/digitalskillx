-- DigitalSkillX staging — system email tracking (run in Supabase SQL Editor)
-- Safe to re-run.

alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz;

alter table public.enrollments
  add column if not exists completion_email_sent_at timestamptz,
  add column if not exists idle_reminder_sent_at timestamptz;

alter table public.transactions
  add column if not exists receipt_email_sent_at timestamptz;

create table if not exists public.system_email_failures (
  id            uuid primary key default gen_random_uuid(),
  email_type    text not null,
  recipient     text not null,
  subject       text not null,
  payload       jsonb not null default '{}'::jsonb,
  error_message text not null,
  created_at    timestamptz not null default now()
);

create index if not exists system_email_failures_type_idx
  on public.system_email_failures (email_type, created_at desc);

alter table public.system_email_failures enable row level security;
