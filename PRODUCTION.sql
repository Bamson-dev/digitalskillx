-- ============================================================================
-- DigitalSkillX — PRODUCTION (Supabase → SQL Editor)
-- Safe to re-run (idempotent).
-- ============================================================================
--
-- ⚠️  IF YOU SEE "function is_admin() does not exist":
--     Run PRODUCTION-RUN-FIRST.sql first, then run THIS entire file.
--
-- STEPS:
--   1. Run PRODUCTION-RUN-FIRST.sql  (creates is_admin)
--   2. Run THIS FILE from line 1      (schema + tables)
--   3. Scroll to BOTTOM → replace PASTE_…_HERE keys → Run again
--
-- ============================================================================


-- ── 0. Auth helpers (must exist before any CREATE POLICY below) ─────────────

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enrollments where course_id = p_course_id and student_id = auth.uid());
$$;

create or replace function public.lesson_course_id(p_lesson_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select m.course_id from public.lessons l join public.modules m on m.id = l.module_id where l.id = p_lesson_id;
$$;


-- ── 1. Marketplace + transactions (0005) ───────────────────────────────────

do $$ begin alter type enrollment_source add value if not exists 'purchase';
exception when duplicate_object then null; end $$;

alter table public.courses
  add column if not exists price_ngn integer not null default 0 check (price_ngn >= 0),
  add column if not exists short_description text,
  add column if not exists learning_outcomes text[] not null default '{}',
  add column if not exists instructor_name text,
  add column if not exists instructor_bio text,
  add column if not exists promo_video_url text;

do $$ begin create type transaction_status as enum ('pending', 'success', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin create type payment_provider as enum ('paystack');
exception when duplicate_object then null; end $$;

create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid references public.profiles (id) on delete cascade,
  course_id     uuid not null references public.courses (id) on delete cascade,
  amount        integer not null check (amount > 0),
  currency      text not null default 'NGN',
  provider      payment_provider not null default 'paystack',
  reference     text not null unique,
  status        transaction_status not null default 'pending',
  paystack_data jsonb,
  anonymized    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists transactions_student_idx on public.transactions (student_id);
create index if not exists transactions_course_idx on public.transactions (course_id);
create index if not exists transactions_reference_idx on public.transactions (reference);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'transactions_set_updated_at') then
    create trigger transactions_set_updated_at before update on public.transactions
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.transactions enable row level security;

drop policy if exists "transactions: read own" on public.transactions;
create policy "transactions: read own" on public.transactions
  for select using (student_id = auth.uid());

drop policy if exists "transactions: admin all" on public.transactions;
create policy "transactions: admin all" on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "modules: read published course" on public.modules;
create policy "modules: read published course" on public.modules
  for select using (exists (select 1 from public.courses c where c.id = course_id and c.visibility = 'published'));

drop policy if exists "lessons: read published outline" on public.lessons;
create policy "lessons: read published outline" on public.lessons
  for select using (exists (
    select 1 from public.modules m join public.courses c on c.id = m.course_id
    where m.id = module_id and c.visibility = 'published'));


-- ── 2. USD pricing (0006) ───────────────────────────────────────────────────

alter table public.courses
  add column if not exists price_usd integer not null default 0 check (price_usd >= 0);


-- ── 3. Launch hardening (0007) ──────────────────────────────────────────────

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete set null,
  email text, message text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_student_idx on public.support_requests (student_id);
create index if not exists support_requests_status_idx on public.support_requests (status);

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'support_requests_set_updated_at') then
    create trigger support_requests_set_updated_at before update on public.support_requests
      for each row execute function public.set_updated_at();
  end if;
end $$;

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key, request_count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.transactions alter column student_id drop not null;
alter table public.transactions add column if not exists anonymized boolean not null default false;

alter table public.support_requests enable row level security;
alter table public.rate_limit_buckets enable row level security;

drop policy if exists "support: student insert own" on public.support_requests;
create policy "support: student insert own" on public.support_requests
  for insert with check (student_id = auth.uid());

drop policy if exists "support: student read own" on public.support_requests;
create policy "support: student read own" on public.support_requests
  for select using (student_id = auth.uid());

drop policy if exists "support: admin all" on public.support_requests;
create policy "support: admin all" on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rate_limits: service only" on public.rate_limit_buckets;
create policy "rate_limits: service only" on public.rate_limit_buckets for all using (false);


-- ── 4. Platform settings (0008) ───────────────────────────────────────────

create table if not exists public.platform_settings (
  id text primary key default 'default' check (id = 'default'),
  platform_name text not null default 'DigitalSkillX',
  logo_url text, favicon_url text,
  primary_color text not null default '#dc2626',
  default_timezone text not null default 'Africa/Lagos',
  email_sender_name text, email_reply_to text,
  default_certificate_template_id uuid references public.certificate_templates (id) on delete set null,
  default_certificate_template_key text check (
    default_certificate_template_key is null
    or default_certificate_template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.platform_settings
  add column if not exists default_certificate_template_key text check (
    default_certificate_template_key is null
    or default_certificate_template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold'));

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'platform_settings_set_updated_at') then
    create trigger platform_settings_set_updated_at before update on public.platform_settings
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.platform_settings (id, default_certificate_template_key)
values ('default', 'gold_charcoal') on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings: admin all" on public.platform_settings;
create policy "platform_settings: admin all" on public.platform_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "platform_settings: public read branding" on public.platform_settings;
create policy "platform_settings: public read branding" on public.platform_settings
  for select using (true);


-- ── 5. Platform secrets (0009+) ─────────────────────────────────────────────

create table if not exists public.platform_secrets (
  id text primary key default 'default' check (id = 'default'),
  youtube_api_key text, deepseek_api_key text,
  paystack_secret_key text, supabase_service_role_key text,
  zeptomail_smtp_password text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.platform_secrets add column if not exists deepseek_api_key text;
alter table public.platform_secrets add column if not exists paystack_secret_key text;
alter table public.platform_secrets add column if not exists supabase_service_role_key text;
alter table public.platform_secrets add column if not exists zeptomail_smtp_password text;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'platform_secrets_set_updated_at') then
    create trigger platform_secrets_set_updated_at before update on public.platform_secrets
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.platform_secrets (id) values ('default') on conflict (id) do nothing;
alter table public.platform_secrets enable row level security;

drop policy if exists "platform_secrets: admin all" on public.platform_secrets;
create policy "platform_secrets: admin all" on public.platform_secrets
  for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_get_service_role_key()
returns text language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  select supabase_service_role_key into secret from public.platform_secrets where id = 'default';
  return secret;
end; $$;

revoke all on function public.admin_get_service_role_key() from public;
grant execute on function public.admin_get_service_role_key() to authenticated;


-- ── 6. Student checkout policy (0011) ───────────────────────────────────────

drop policy if exists "transactions: insert own pending checkout" on public.transactions;
create policy "transactions: insert own pending checkout" on public.transactions
  for insert with check (
    student_id = auth.uid() and status = 'pending'
    and exists (select 1 from public.courses c where c.id = course_id
      and c.visibility = 'published' and c.enrollment_type = 'open'));


-- ── 7. Certificate templates (0012 + 0014) ─────────────────────────────────

alter table public.certificate_templates add column if not exists template_key text;

create unique index if not exists certificate_templates_template_key_idx
  on public.certificate_templates (template_key) where template_key is not null;

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Gold Charcoal', 'gold_charcoal', true, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'gold_charcoal');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Navy Ribbon', 'navy_ribbon', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'navy_ribbon');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Green Gold', 'green_gold', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'green_gold');

alter table public.course_categories add column if not exists template_key text check (
  template_key is null or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold'));

alter table public.courses add column if not exists certificate_template_override text check (
  certificate_template_override is null
  or certificate_template_override in ('gold_charcoal', 'navy_ribbon', 'green_gold'));

alter table public.certificates add column if not exists template_key text check (
  template_key is null or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold'));

update public.platform_settings
set default_certificate_template_key = coalesce(default_certificate_template_key, 'gold_charcoal')
where id = 'default';

delete from public.certificate_templates
where template_key is null or template_key not in ('gold_charcoal', 'navy_ribbon', 'green_gold')
   or name ilike '%Pdigital Default%';


-- ── 8. System emails (0015) ─────────────────────────────────────────────────

alter table public.profiles add column if not exists welcome_email_sent_at timestamptz;

alter table public.enrollments
  add column if not exists completion_email_sent_at timestamptz,
  add column if not exists idle_reminder_sent_at timestamptz;

alter table public.transactions add column if not exists receipt_email_sent_at timestamptz;

create table if not exists public.system_email_failures (
  id uuid primary key default gen_random_uuid(),
  email_type text not null, recipient text not null, subject text not null,
  payload jsonb not null default '{}'::jsonb,
  error_message text not null,
  created_at timestamptz not null default now()
);

create index if not exists system_email_failures_type_idx
  on public.system_email_failures (email_type, created_at desc);

alter table public.system_email_failures enable row level security;


-- ── 9. Course resources (0016) ──────────────────────────────────────────────

alter table public.resources add column if not exists position integer not null default 0;

create index if not exists resources_course_level_idx
  on public.resources (course_id, position) where lesson_id is null;


-- ── 10. Admin account bootstrap ─────────────────────────────────────────────

insert into public.profiles (id, email, full_name, role)
select id, email, 'Platform Admin', 'admin' from auth.users
where lower(email) = 'admin@digitalskillx.com'
on conflict (id) do update set role = 'admin';

update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) = 'admin@digitalskillx.com';


-- ============================================================================
-- ▼▼▼  PASTE YOUR SECRET KEYS HERE (scroll to bottom)  ▼▼▼
-- ============================================================================
-- Replace PASTE_…_HERE with real values, then Run this block (or whole file).

update public.platform_secrets set
  supabase_service_role_key = 'PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE',
  paystack_secret_key       = 'PASTE_PAYSTACK_SECRET_KEY_HERE',
  zeptomail_smtp_password   = 'PASTE_ZEPTOMAIL_SMTP_PASSWORD_HERE',
  youtube_api_key           = 'PASTE_YOUTUBE_API_KEY_HERE',
  deepseek_api_key          = 'PASTE_DEEPSEEK_API_KEY_HERE'
where id = 'default';

-- Vercel CRON bootstrap (same value as CRON_SECRET in Vercel env):
-- update public.platform_settings
-- set cron_auth_secret = 'paste-your-cron-secret-here'
-- where id = 'default';


-- ── 11. Verification ────────────────────────────────────────────────────────

select
  (select count(*) from public.platform_settings where id = 'default') as platform_settings,
  (select count(*) from public.platform_secrets where id = 'default') as platform_secrets,
  (select proname from pg_proc where proname = 'is_admin' limit 1) as is_admin_function,
  (select proname from pg_proc where proname = 'server_bootstrap_platform_secrets' limit 1) as cron_bootstrap_rpc,
  (select cron_auth_secret is not null and cron_auth_secret <> ''
   from public.platform_settings where id = 'default') as cron_auth_secret_set,
  (select supabase_service_role_key is not null
     and supabase_service_role_key <> 'PASTE_SUPABASE_SERVICE_ROLE_KEY_HERE'
   from public.platform_secrets where id = 'default') as service_role_saved,
  (select paystack_secret_key is not null
     and paystack_secret_key <> 'PASTE_PAYSTACK_SECRET_KEY_HERE'
   from public.platform_secrets where id = 'default') as paystack_saved,
  (select zeptomail_smtp_password is not null
     and zeptomail_smtp_password <> 'PASTE_ZEPTOMAIL_SMTP_PASSWORD_HERE'
   from public.platform_secrets where id = 'default') as zeptomail_saved;
