-- Run this ONLY when CHECK_SCHEMA shows:
--   has_user_role = true, has_courses = true
--   but has_price_ngn / has_transactions / has_support_requests = false
--
-- If you get "function public.is_admin() does not exist", run
-- FIX_0002_AUTH_HELPERS.sql first (or the block below is included here).

-- ── Auth helpers (from 0002 — required by RLS policies below) ─

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.is_enrolled(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.enrollments
    where course_id = p_course_id and student_id = auth.uid()
  );
$$;

create or replace function public.lesson_course_id(p_lesson_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.course_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id;
$$;

-- ── 0005_marketplace ──────────────────────────────────────────

alter type enrollment_source add value if not exists 'purchase';

alter table public.courses
  add column if not exists price_ngn integer not null default 0 check (price_ngn >= 0),
  add column if not exists short_description text,
  add column if not exists learning_outcomes text[] not null default '{}',
  add column if not exists instructor_name text,
  add column if not exists instructor_bio text,
  add column if not exists promo_video_url text;

do $$ begin
  create type transaction_status as enum ('pending', 'success', 'failed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_provider as enum ('paystack');
exception when duplicate_object then null;
end $$;

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  amount       integer not null check (amount > 0),
  currency     text not null default 'NGN',
  provider     payment_provider not null default 'paystack',
  reference    text not null unique,
  status       transaction_status not null default 'pending',
  paystack_data jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists transactions_student_idx on public.transactions (student_id);
create index if not exists transactions_course_idx on public.transactions (course_id);
create index if not exists transactions_reference_idx on public.transactions (reference);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

drop policy if exists "transactions: read own" on public.transactions;
create policy "transactions: read own" on public.transactions
  for select using (student_id = auth.uid());

drop policy if exists "transactions: admin all" on public.transactions;
create policy "transactions: admin all" on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "modules: read published course" on public.modules;
create policy "modules: read published course" on public.modules
  for select using (
    exists (
      select 1 from public.courses c
      where c.id = course_id and c.visibility = 'published'
    )
  );

drop policy if exists "lessons: read published outline" on public.lessons;
create policy "lessons: read published outline" on public.lessons
  for select using (
    exists (
      select 1 from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_id and c.visibility = 'published'
    )
  );

-- ── 0006_price_usd ────────────────────────────────────────────

alter table public.courses
  add column if not exists price_usd integer not null default 0 check (price_usd >= 0);

-- ── 0007_launch_hardening ─────────────────────────────────────

create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid references public.profiles (id) on delete set null,
  email      text,
  message    text not null,
  status     text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_student_idx on public.support_requests (student_id);
create index if not exists support_requests_status_idx on public.support_requests (status);

drop trigger if exists support_requests_set_updated_at on public.support_requests;
create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

create table if not exists public.rate_limit_buckets (
  bucket_key    text primary key,
  request_count integer not null default 0,
  window_start  timestamptz not null default now()
);

alter table public.transactions
  alter column student_id drop not null;

alter table public.transactions
  add column if not exists anonymized boolean not null default false;

alter table public.rate_limit_buckets enable row level security;
alter table public.support_requests enable row level security;

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
create policy "rate_limits: service only" on public.rate_limit_buckets
  for all using (false);
