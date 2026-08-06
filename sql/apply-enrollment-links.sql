-- Enrollment Link System (Part 1–3)
-- Idempotent. Apply via CLI or SQL Editor (see sql/apply-enrollment-links.sql).

-- Extend enrollment source (must run before inserts that use the new value)
do $$ begin
  alter type public.enrollment_source add value if not exists 'enrollment_link';
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.enrollment_link_status as enum (
    'draft', 'active', 'disabled', 'expired', 'deleted'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.enrollment_link_access as enum (
    'public', 'imported_students'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.enrollment_link_redirect as enum (
    'success_page', 'first_course', 'dashboard', 'specific_course'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.enrollment_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  token_prefix text not null default '',
  name text not null,
  description text not null default '',
  status public.enrollment_link_status not null default 'active',
  access_type public.enrollment_link_access not null default 'public',
  max_redemptions integer,
  current_redemptions integer not null default 0,
  expires_at timestamptz,
  redirect_type public.enrollment_link_redirect not null default 'success_page',
  redirect_course_id uuid references public.courses (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint enrollment_links_token_hash_unique unique (token_hash),
  constraint enrollment_links_redemptions_nonneg check (current_redemptions >= 0),
  constraint enrollment_links_max_check check (
    max_redemptions is null
    or (max_redemptions > 0 and current_redemptions <= max_redemptions)
  )
);

create index if not exists enrollment_links_status_deleted_idx
  on public.enrollment_links (status, deleted_at);
create index if not exists enrollment_links_created_by_idx
  on public.enrollment_links (created_by);
create index if not exists enrollment_links_expires_at_idx
  on public.enrollment_links (expires_at)
  where deleted_at is null;

create table if not exists public.enrollment_link_courses (
  id uuid primary key default gen_random_uuid(),
  enrollment_link_id uuid not null references public.enrollment_links (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (enrollment_link_id, course_id)
);

create index if not exists enrollment_link_courses_link_idx
  on public.enrollment_link_courses (enrollment_link_id);

create table if not exists public.enrollment_link_redemptions (
  id uuid primary key default gen_random_uuid(),
  enrollment_link_id uuid not null references public.enrollment_links (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  ip_address text,
  user_agent text,
  browser text,
  device text,
  country text,
  city text,
  redeemed_at timestamptz not null default now(),
  unique (enrollment_link_id, user_id)
);

create index if not exists enrollment_link_redemptions_user_idx
  on public.enrollment_link_redemptions (user_id);
create index if not exists enrollment_link_redemptions_email_idx
  on public.enrollment_link_redemptions (email);
create index if not exists enrollment_link_redemptions_link_idx
  on public.enrollment_link_redemptions (enrollment_link_id);
create index if not exists enrollment_link_redemptions_redeemed_at_idx
  on public.enrollment_link_redemptions (redeemed_at);

create table if not exists public.enrollment_events (
  id uuid primary key default gen_random_uuid(),
  enrollment_link_id uuid references public.enrollment_links (id) on delete set null,
  user_id uuid references public.profiles (id) on delete set null,
  event text not null,
  metadata jsonb not null default '{}'::jsonb,
  request_id text,
  correlation_id text,
  created_at timestamptz not null default now()
);

create index if not exists enrollment_events_link_idx
  on public.enrollment_events (enrollment_link_id, created_at desc);
create index if not exists enrollment_events_event_idx
  on public.enrollment_events (event, created_at desc);
create index if not exists enrollment_events_correlation_idx
  on public.enrollment_events (correlation_id)
  where correlation_id is not null;

alter table public.enrollment_links enable row level security;
alter table public.enrollment_link_courses enable row level security;
alter table public.enrollment_link_redemptions enable row level security;
alter table public.enrollment_events enable row level security;

drop policy if exists "enrollment_links: admin all" on public.enrollment_links;
create policy "enrollment_links: admin all" on public.enrollment_links
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "enrollment_link_courses: admin all" on public.enrollment_link_courses;
create policy "enrollment_link_courses: admin all" on public.enrollment_link_courses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "enrollment_link_redemptions: admin all" on public.enrollment_link_redemptions;
create policy "enrollment_link_redemptions: admin all" on public.enrollment_link_redemptions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "enrollment_link_redemptions: student own read" on public.enrollment_link_redemptions;
create policy "enrollment_link_redemptions: student own read" on public.enrollment_link_redemptions
  for select using (auth.uid() = user_id);

drop policy if exists "enrollment_events: admin all" on public.enrollment_events;
create policy "enrollment_events: admin all" on public.enrollment_events
  for all using (public.is_admin()) with check (public.is_admin());

-- Atomic claim: lock link, enforce limits, insert redemption, increment counter.
-- Returns jsonb: { ok, idempotent?, code?, redemption_id? }
create or replace function public.claim_enrollment_link_redemption(
  p_link_id uuid,
  p_user_id uuid,
  p_email text,
  p_ip text default null,
  p_user_agent text default null,
  p_browser text default null,
  p_device text default null,
  p_country text default null,
  p_city text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  link public.enrollment_links%rowtype;
  existing_id uuid;
  new_id uuid;
begin
  select * into link
  from public.enrollment_links
  where id = p_link_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'INVALID_LINK');
  end if;

  if link.deleted_at is not null or link.status = 'deleted' then
    return jsonb_build_object('ok', false, 'code', 'DISABLED');
  end if;

  if link.status = 'disabled' then
    return jsonb_build_object('ok', false, 'code', 'DISABLED');
  end if;

  if link.status = 'draft' then
    return jsonb_build_object('ok', false, 'code', 'DISABLED');
  end if;

  if link.expires_at is not null and link.expires_at < now() then
    update public.enrollment_links set status = 'expired', updated_at = now() where id = link.id;
    return jsonb_build_object('ok', false, 'code', 'EXPIRED');
  end if;

  select id into existing_id
  from public.enrollment_link_redemptions
  where enrollment_link_id = link.id and user_id = p_user_id;

  if existing_id is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'redemption_id', existing_id);
  end if;

  if link.max_redemptions is not null and link.current_redemptions >= link.max_redemptions then
    return jsonb_build_object('ok', false, 'code', 'LIMIT_REACHED');
  end if;

  if link.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'DISABLED');
  end if;

  insert into public.enrollment_link_redemptions (
    enrollment_link_id, user_id, email, ip_address, user_agent, browser, device, country, city
  ) values (
    link.id, p_user_id, lower(trim(p_email)), p_ip, p_user_agent, p_browser, p_device, p_country, p_city
  )
  returning id into new_id;

  update public.enrollment_links
  set current_redemptions = current_redemptions + 1,
      updated_at = now()
  where id = link.id;

  return jsonb_build_object('ok', true, 'idempotent', false, 'redemption_id', new_id);
end;
$$;

revoke all on function public.claim_enrollment_link_redemption(
  uuid, uuid, text, text, text, text, text, text, text
) from public;
grant execute on function public.claim_enrollment_link_redemption(
  uuid, uuid, text, text, text, text, text, text, text
) to service_role;
