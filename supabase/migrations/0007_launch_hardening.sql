-- Launch hardening: support, rate limits, anonymized transactions.

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

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function public.set_updated_at();

create table if not exists public.rate_limit_buckets (
  bucket_key    text primary key,
  request_count integer not null default 0,
  window_start  timestamptz not null default now()
);

-- Allow transaction records to outlive deleted student accounts (accounting).
alter table public.transactions
  alter column student_id drop not null;

alter table public.transactions
  add column if not exists anonymized boolean not null default false;

alter table public.rate_limit_buckets enable row level security;
alter table public.support_requests enable row level security;

create policy "support: student insert own" on public.support_requests
  for insert with check (student_id = auth.uid());

create policy "support: student read own" on public.support_requests
  for select using (student_id = auth.uid());

create policy "support: admin all" on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

create policy "rate_limits: service only" on public.rate_limit_buckets
  for all using (false);
