-- Account sessions / device security (additive). Does not alter auth schema.
-- Apply via SQL Editor or CLI. Idempotent.

create table if not exists public.account_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_token_hash text not null,
  browser text,
  os text,
  device text,
  country text,
  city text,
  ip_address text,
  user_agent text,
  latitude double precision,
  longitude double precision,
  is_current boolean not null default false,
  flagged_impossible_travel boolean not null default false,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint account_sessions_token_hash_unique unique (session_token_hash)
);

create index if not exists account_sessions_user_id_idx
  on public.account_sessions (user_id)
  where revoked_at is null;

create index if not exists account_sessions_last_active_idx
  on public.account_sessions (user_id, last_active_at desc);

alter table public.account_sessions enable row level security;

drop policy if exists "account_sessions_select_own" on public.account_sessions;
create policy "account_sessions_select_own"
  on public.account_sessions for select
  to authenticated
  using (user_id = auth.uid());

-- Mutations go through service role / server routes only.
drop policy if exists "account_sessions_no_client_write" on public.account_sessions;
-- No insert/update/delete policies for authenticated → client cannot forge sessions.

comment on table public.account_sessions is
  'Student device/session inventory for Account Security. Auth sessions remain in Supabase Auth.';
