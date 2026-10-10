-- Durable, per-student course publish email queue. Apply to staging first.
create table if not exists public.program_course_publish_email_outbox (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, student_id)
);

create index if not exists program_course_publish_email_outbox_ready_idx
  on public.program_course_publish_email_outbox(status, scheduled_at);
alter table public.program_course_publish_email_outbox enable row level security;

-- Existing delivery records mean the old synchronous sender recorded a successful send.
insert into public.program_course_publish_email_outbox
  (course_id, student_id, email, payload, status, sent_at)
select d.course_id, d.student_id, coalesce(p.email, ''), '{}'::jsonb, 'sent', d.created_at
from public.program_course_publish_deliveries d
left join public.profiles p on p.id = d.student_id
on conflict (course_id, student_id) do nothing;

create or replace function public.claim_program_course_publish_email_outbox(p_limit integer default 40)
returns setof public.program_course_publish_email_outbox
language plpgsql security definer set search_path = public as $$
begin
  return query
  with picked as (
    select id from public.program_course_publish_email_outbox
    where status = 'pending' and scheduled_at <= now()
    order by scheduled_at for update skip locked
    limit greatest(1, least(coalesce(p_limit, 40), 200))
  )
  update public.program_course_publish_email_outbox o
  set status = 'sending', attempts = o.attempts + 1, claimed_at = now(), updated_at = now()
  from picked where o.id = picked.id returning o.*;
end;
$$;
revoke all on function public.claim_program_course_publish_email_outbox(integer) from public;
grant execute on function public.claim_program_course_publish_email_outbox(integer) to service_role;

create or replace function public.reclaim_program_course_publish_email_outbox(p_minutes integer default 15)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.program_course_publish_email_outbox
  set status = 'pending', claimed_at = null, scheduled_at = now(), updated_at = now(),
      last_error = coalesce(last_error, 'Recovered stale in-flight delivery')
  where status = 'sending' and claimed_at < now() - make_interval(mins => greatest(1, coalesce(p_minutes, 15)));
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.reclaim_program_course_publish_email_outbox(integer) from public;
grant execute on function public.reclaim_program_course_publish_email_outbox(integer) to service_role;
