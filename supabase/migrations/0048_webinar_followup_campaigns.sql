-- Standalone Webinar Follow-Up email campaign engine (additive only).
-- Completely separate from LMS students, AI Money Code (0046), and Stage 11 (0047).
-- Contacts are identified by email only — no profile_id / enrollments required.
-- Campaign seeded as DRAFT. Do not enroll or activate without explicit authorization.

-- ── Campaigns
create table if not exists public.webinar_followup_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  offer_url text not null default 'https://aimoneycode.com.ng/offer',
  offer_price_label text not null default '₦49,999',
  offer_value_label text not null default '₦805,000',
  total_steps integer not null default 0 check (total_steps >= 0),
  activated_at timestamptz,
  paused_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinar_followup_campaigns_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80
  )
);

create unique index if not exists webinar_followup_campaigns_slug_uidx
  on public.webinar_followup_campaigns (slug);
create index if not exists webinar_followup_campaigns_status_idx
  on public.webinar_followup_campaigns (status);

alter table public.webinar_followup_campaigns enable row level security;
drop policy if exists webinar_followup_campaigns_admin_all on public.webinar_followup_campaigns;
create policy webinar_followup_campaigns_admin_all on public.webinar_followup_campaigns
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists webinar_followup_campaigns_set_updated_at on public.webinar_followup_campaigns;
create trigger webinar_followup_campaigns_set_updated_at
  before update on public.webinar_followup_campaigns
  for each row execute function public.set_updated_at();

-- ── Sequence steps (editable, not hardcoded length)
create table if not exists public.webinar_followup_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.webinar_followup_campaigns (id) on delete cascade,
  step_number integer not null check (step_number >= 1),
  internal_title text not null default '',
  subject text not null,
  preview_text text not null default '',
  body_html text not null,
  body_text text not null default '',
  cta_label text not null default 'See The Full Offer',
  cta_url text not null default 'https://aimoneycode.com.ng/offer',
  delay_hours integer not null default 24 check (delay_hours >= 0),
  status text not null default 'active'
    check (status in ('active', 'draft', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinar_followup_steps_unique unique (campaign_id, step_number)
);

create index if not exists webinar_followup_steps_campaign_idx
  on public.webinar_followup_sequence_steps (campaign_id, step_number);

alter table public.webinar_followup_sequence_steps enable row level security;
drop policy if exists webinar_followup_steps_admin_all on public.webinar_followup_sequence_steps;
create policy webinar_followup_steps_admin_all on public.webinar_followup_sequence_steps
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists webinar_followup_steps_set_updated_at on public.webinar_followup_sequence_steps;
create trigger webinar_followup_steps_set_updated_at
  before update on public.webinar_followup_sequence_steps
  for each row execute function public.set_updated_at();

-- ── Contacts (email is primary identity — no LMS profile required)
create table if not exists public.webinar_followup_contacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.webinar_followup_campaigns (id) on delete cascade,
  email text not null,
  normalized_email text not null,
  first_name text,
  status text not null default 'active'
    check (status in ('active', 'waiting', 'completed', 'unsubscribed', 'failed', 'paused')),
  current_step integer not null default 1 check (current_step >= 1),
  last_sent_step integer not null default 0 check (last_sent_step >= 0),
  enrolled_at timestamptz not null default now(),
  next_send_at timestamptz not null default now(),
  last_sent_at timestamptz,
  completed_at timestamptz,
  unsubscribed_at timestamptz,
  failed_at timestamptz,
  last_error text,
  source_import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinar_followup_contacts_campaign_email_unique unique (campaign_id, normalized_email)
);

create index if not exists webinar_followup_contacts_due_idx
  on public.webinar_followup_contacts (campaign_id, status, next_send_at)
  where status = 'active';
create index if not exists webinar_followup_contacts_email_idx
  on public.webinar_followup_contacts (normalized_email);

alter table public.webinar_followup_contacts enable row level security;
drop policy if exists webinar_followup_contacts_admin_all on public.webinar_followup_contacts;
create policy webinar_followup_contacts_admin_all on public.webinar_followup_contacts
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists webinar_followup_contacts_set_updated_at on public.webinar_followup_contacts;
create trigger webinar_followup_contacts_set_updated_at
  before update on public.webinar_followup_contacts
  for each row execute function public.set_updated_at();

-- ── Send ledger (contact + step unique — no duplicate step sends)
create table if not exists public.webinar_followup_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.webinar_followup_campaigns (id) on delete cascade,
  contact_id uuid not null references public.webinar_followup_contacts (id) on delete cascade,
  step_id uuid not null references public.webinar_followup_sequence_steps (id) on delete restrict,
  step_number integer not null check (step_number >= 1),
  idempotency_key text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  provider_message_id text,
  last_error text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint webinar_followup_sends_contact_step_unique unique (contact_id, step_number)
);

create unique index if not exists webinar_followup_sends_idempotency_uidx
  on public.webinar_followup_sends (idempotency_key);
create index if not exists webinar_followup_sends_due_idx
  on public.webinar_followup_sends (status, scheduled_at);

alter table public.webinar_followup_sends enable row level security;
drop policy if exists webinar_followup_sends_admin_all on public.webinar_followup_sends;
create policy webinar_followup_sends_admin_all on public.webinar_followup_sends
  for all using (public.is_admin()) with check (public.is_admin());

drop trigger if exists webinar_followup_sends_set_updated_at on public.webinar_followup_sends;
create trigger webinar_followup_sends_set_updated_at
  before update on public.webinar_followup_sends
  for each row execute function public.set_updated_at();

-- ── CSV import batches
create table if not exists public.webinar_followup_imports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.webinar_followup_campaigns (id) on delete cascade,
  file_name text not null,
  uploaded_by uuid references public.profiles (id) on delete set null,
  status text not null default 'dry_run'
    check (status in ('dry_run', 'confirmed', 'failed', 'cancelled')),
  total_rows integer not null default 0,
  valid_emails integer not null default 0,
  invalid_emails integer not null default 0,
  duplicates_in_file integer not null default 0,
  already_in_campaign integer not null default 0,
  suppressed integer not null default 0,
  newly_enrolled integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists webinar_followup_imports_campaign_idx
  on public.webinar_followup_imports (campaign_id, created_at desc);

alter table public.webinar_followup_imports enable row level security;
drop policy if exists webinar_followup_imports_admin_all on public.webinar_followup_imports;
create policy webinar_followup_imports_admin_all on public.webinar_followup_imports
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.webinar_followup_contacts
  drop constraint if exists webinar_followup_contacts_source_import_fk;
alter table public.webinar_followup_contacts
  add constraint webinar_followup_contacts_source_import_fk
  foreign key (source_import_id) references public.webinar_followup_imports (id) on delete set null;

-- ── Claim due sends (FOR UPDATE SKIP LOCKED)
create or replace function public.claim_webinar_followup_sends(p_limit integer default 20)
returns setof public.webinar_followup_sends
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select s.id
    from public.webinar_followup_sends s
    join public.webinar_followup_campaigns c on c.id = s.campaign_id
    join public.webinar_followup_contacts r on r.id = s.contact_id
    where s.status = 'pending'
      and s.scheduled_at <= now()
      and c.status = 'active'
      and r.status = 'active'
    order by s.scheduled_at
    for update of s skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  )
  update public.webinar_followup_sends s
  set status = 'sending',
      attempts = s.attempts + 1,
      updated_at = now()
  from picked
  where s.id = picked.id
  returning s.*;
end;
$$;

revoke all on function public.claim_webinar_followup_sends(integer) from public;
grant execute on function public.claim_webinar_followup_sends(integer) to service_role;

create or replace function public.reclaim_stale_webinar_followup_sends(
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
  update public.webinar_followup_sends s
  set status = 'pending',
      updated_at = now(),
      last_error = coalesce(s.last_error, 'reclaimed_stale_sending')
  where s.status = 'sending'
    and s.updated_at < now() - make_interval(mins => greatest(1, coalesce(p_older_than_minutes, 15)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.reclaim_stale_webinar_followup_sends(integer) from public;
grant execute on function public.reclaim_stale_webinar_followup_sends(integer) to service_role;

-- Seed first campaign as DRAFT only — no contacts, no activation.
insert into public.webinar_followup_campaigns (
  slug, name, description, status, offer_url, offer_price_label, offer_value_label, total_steps
) values (
  'build-software-with-ai',
  'How To Build Software With AI And Get Paid For It',
  'Post-WebinarJam evergreen follow-up. Per-contact independent sequence. Starts after WebinarJam closing emails end.',
  'draft',
  'https://aimoneycode.com.ng/offer',
  '₦49,999',
  '₦805,000',
  0
)
on conflict (slug) do nothing;
