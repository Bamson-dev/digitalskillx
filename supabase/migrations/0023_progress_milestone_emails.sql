-- Progress milestone email tracking (25%, 50%, 75% course completion).

alter table public.enrollments
  add column if not exists milestone_25_email_sent_at timestamptz,
  add column if not exists milestone_50_email_sent_at timestamptz,
  add column if not exists milestone_75_email_sent_at timestamptz;
