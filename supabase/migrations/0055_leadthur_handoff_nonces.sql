-- Persistent nonce replay protection for Leadthur -> DigitalSkillX Paystack handoffs.

create table if not exists public.leadthur_handoff_nonces (
  nonce       text primary key,
  event_id    text not null,
  product_key text not null,
  reference   text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

create index if not exists leadthur_handoff_nonces_expires_idx
  on public.leadthur_handoff_nonces (expires_at);

alter table public.leadthur_handoff_nonces enable row level security;
