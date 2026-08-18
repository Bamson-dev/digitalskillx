-- Evergreen marketing email campaigns (AI Money Code 30-day sequence).
-- Additive only. DO NOT APPLY until explicitly authorized.
-- Reuses Resend via sendEmail. Does not alter bulk_import_email_outbox
-- or transactional system email tables.
-- Campaign is seeded in draft. Recipients are NOT auto-enrolled.

-- ── Global marketing suppression (unsubscribe / bounce / complaint / manual)
create table if not exists public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text not null default 'unsubscribe'
    check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  source text,
  created_at timestamptz not null default now()
);

create unique index if not exists email_suppressions_email_uidx
  on public.email_suppressions (email);

alter table public.email_suppressions enable row level security;

drop policy if exists email_suppressions_admin_all on public.email_suppressions;
create policy email_suppressions_admin_all on public.email_suppressions
  for all using (public.is_admin()) with check (public.is_admin());

-- ── Campaign definitions
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused')),
  total_steps integer not null default 30 check (total_steps = 30),
  activated_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_campaigns_slug_uidx
  on public.email_campaigns (slug);

alter table public.email_campaigns enable row level security;

drop policy if exists email_campaigns_admin_all on public.email_campaigns;
create policy email_campaigns_admin_all on public.email_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

create trigger email_campaigns_set_updated_at
  before update on public.email_campaigns
  for each row execute function public.set_updated_at();

-- ── Per-recipient campaign state
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  email text not null,
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text,
  status text not null default 'active'
    check (status in ('active', 'completed', 'unsubscribed', 'failed')),
  next_step integer not null default 1 check (next_step >= 1 and next_step <= 31),
  last_sent_step integer not null default 0,
  last_sent_at timestamptz,
  next_send_at timestamptz not null default now(),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unsubscribed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_campaign_recipients_campaign_email_uidx
  on public.email_campaign_recipients (campaign_id, email);

create index if not exists email_campaign_recipients_due_idx
  on public.email_campaign_recipients (campaign_id, status, next_send_at)
  where status = 'active';

alter table public.email_campaign_recipients enable row level security;

drop policy if exists email_campaign_recipients_admin_all on public.email_campaign_recipients;
create policy email_campaign_recipients_admin_all on public.email_campaign_recipients
  for all using (public.is_admin()) with check (public.is_admin());

create trigger email_campaign_recipients_set_updated_at
  before update on public.email_campaign_recipients
  for each row execute function public.set_updated_at();

-- ── Per-step send ledger (idempotency)
create table if not exists public.email_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns (id) on delete cascade,
  recipient_id uuid not null references public.email_campaign_recipients (id) on delete cascade,
  step_number integer not null check (step_number >= 1 and step_number <= 30),
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_campaign_sends_recipient_step_uidx
  on public.email_campaign_sends (recipient_id, step_number);

create unique index if not exists email_campaign_sends_idempotency_uidx
  on public.email_campaign_sends (idempotency_key);

create index if not exists email_campaign_sends_due_idx
  on public.email_campaign_sends (status, scheduled_at);

alter table public.email_campaign_sends enable row level security;

drop policy if exists email_campaign_sends_admin_all on public.email_campaign_sends;
create policy email_campaign_sends_admin_all on public.email_campaign_sends
  for all using (public.is_admin()) with check (public.is_admin());

create trigger email_campaign_sends_set_updated_at
  before update on public.email_campaign_sends
  for each row execute function public.set_updated_at();

-- ── Claim due send rows for the campaign processor (FOR UPDATE SKIP LOCKED)
create or replace function public.claim_email_campaign_sends(p_limit integer default 20)
returns setof public.email_campaign_sends
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select s.id
    from public.email_campaign_sends s
    join public.email_campaigns c on c.id = s.campaign_id
    join public.email_campaign_recipients r on r.id = s.recipient_id
    where s.status = 'pending'
      and s.scheduled_at <= now()
      and c.status = 'active'
      and r.status = 'active'
    order by s.scheduled_at
    for update of s skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.email_campaign_sends s
  set status = 'sending',
      attempts = s.attempts + 1,
      updated_at = now()
  from picked
  where s.id = picked.id
  returning s.*;
end;
$$;

revoke all on function public.claim_email_campaign_sends(integer) from public;
grant execute on function public.claim_email_campaign_sends(integer) to service_role;

create or replace function public.reclaim_stale_email_campaign_sends(
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
  update public.email_campaign_sends s
  set status = 'pending',
      updated_at = now(),
      last_error = coalesce(s.last_error, 'reclaimed_stale_sending')
  where s.status = 'sending'
    and s.updated_at < now() - make_interval(mins => greatest(1, coalesce(p_older_than_minutes, 15)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.reclaim_stale_email_campaign_sends(integer) from public;
grant execute on function public.reclaim_stale_email_campaign_sends(integer) to service_role;

-- Seed the AI Money Code campaign in DRAFT. Do not enroll anyone.
insert into public.email_campaigns (slug, name, status, total_steps)
values (
  'aimoneycode-30-day',
  'AI Money Code 30-Day Email Sequence',
  'draft',
  30
)
on conflict (slug) do nothing;
