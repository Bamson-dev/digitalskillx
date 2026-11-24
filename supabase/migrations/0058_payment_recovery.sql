-- Payment recovery: failed and abandoned Paystack checkout recovery.
-- Additive only. Reuses public.transactions as the payment record of truth.
-- Rollback: supabase/migrations/rollback/0058_payment_recovery_down.sql

-- One row per customer + product order. Repeated attempts for the same
-- email and course while the order is open join the same group.
create table if not exists public.payment_recovery_groups (
  id uuid primary key default gen_random_uuid(),
  customer_email text not null,
  customer_name text,
  customer_phone text,
  student_id uuid references public.profiles (id) on delete set null,
  course_id uuid references public.courses (id) on delete set null,
  product_title text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  payment_status text not null default 'initiated'
    check (payment_status in (
      'initiated','awaiting_payment','pending','processing','successful','failed',
      'abandoned','reversed','bank_transfer_pending','bank_transfer_confirmed','expired'
    )),
  recovery_status text not null default 'none'
    check (recovery_status in (
      'none','scheduled','in_progress','completed','recovered','cancelled',
      'opted_out','suppressed','no_email','excluded'
    )),
  is_open boolean not null default true,
  source text not null default 'checkout' check (source in ('checkout','historical')),
  failure_reason text,
  payment_method text,
  bank_reference text not null,
  retry_token text not null,
  first_attempt_at timestamptz not null default now(),
  failed_at timestamptz,
  abandoned_at timestamptz,
  next_message_at timestamptz,
  initial_sent_at timestamptz,
  last_email_at timestamptz,
  last_email_step text,
  last_email_status text,
  emails_sent integer not null default 0,
  recovered_at timestamptz,
  recovered_via text check (recovered_via in ('paystack','bank_transfer')),
  recovered_reference text,
  recovered_amount_kobo bigint,
  recovered_after_step text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_recovery_groups_open_uidx
  on public.payment_recovery_groups (lower(customer_email), course_id)
  where is_open;
create unique index if not exists payment_recovery_groups_bank_ref_uidx
  on public.payment_recovery_groups (bank_reference);
create unique index if not exists payment_recovery_groups_retry_token_uidx
  on public.payment_recovery_groups (retry_token);
create index if not exists payment_recovery_groups_due_idx
  on public.payment_recovery_groups (next_message_at)
  where is_open and next_message_at is not null;
create index if not exists payment_recovery_groups_status_idx
  on public.payment_recovery_groups (payment_status, recovery_status, created_at desc);

-- Every Paystack reference linked to a group. Old references are never overwritten.
create table if not exists public.payment_recovery_attempts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.payment_recovery_groups (id) on delete cascade,
  reference text not null,
  source text not null default 'checkout' check (source in ('checkout','retry','historical')),
  status text not null default 'awaiting_payment'
    check (status in (
      'initiated','awaiting_payment','pending','processing','successful','failed',
      'abandoned','reversed','expired'
    )),
  amount_kobo bigint not null,
  paystack_status text,
  gateway_response text,
  channel text,
  verify_count integer not null default 0,
  verify_failures integer not null default 0,
  last_verified_at timestamptz,
  next_verify_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_recovery_attempts_reference_uidx
  on public.payment_recovery_attempts (reference);
create index if not exists payment_recovery_attempts_due_idx
  on public.payment_recovery_attempts (next_verify_at)
  where status in ('initiated','awaiting_payment','pending','processing');
create index if not exists payment_recovery_attempts_group_idx
  on public.payment_recovery_attempts (group_id, created_at);

-- One row per recovery email. Unique (group, step) blocks duplicate scheduled sends.
create table if not exists public.payment_recovery_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.payment_recovery_groups (id) on delete cascade,
  step text not null check (step in ('initial','reminder_24h','final_48h','manual')),
  manual_seq integer not null default 0,
  to_email text not null,
  status text not null default 'sending'
    check (status in ('sending','sent','delivered','delivery_delayed','bounced','complained','failed','suppressed')),
  resend_id text,
  retry_count integer not null default 0,
  error text,
  bounce_type text,
  last_event text,
  last_event_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_recovery_messages_step_uidx
  on public.payment_recovery_messages (group_id, step, manual_seq);
create unique index if not exists payment_recovery_messages_resend_uidx
  on public.payment_recovery_messages (resend_id) where resend_id is not null;

-- Timeline: status changes, verification results, notes, admin actions.
create table if not exists public.payment_recovery_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.payment_recovery_groups (id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists payment_recovery_events_group_idx
  on public.payment_recovery_events (group_id, created_at);

-- Bank transfer confirmations. Only an admin creates these, after checking the bank credit.
create table if not exists public.payment_recovery_bank_confirmations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.payment_recovery_groups (id) on delete cascade,
  bank_reference text not null,
  expected_amount_kobo bigint not null,
  received_amount_kobo bigint not null,
  bank_transaction_ref text not null,
  status text not null check (status in ('confirmed','investigating','rejected')),
  notes text,
  admin_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists payment_recovery_bank_confirmed_uidx
  on public.payment_recovery_bank_confirmations (group_id) where status = 'confirmed';

-- Addresses that must not receive recovery email (hard bounce, complaint, opt-out).
create table if not exists public.payment_recovery_suppressions (
  email text primary key,
  reason text not null check (reason in ('hard_bounce','complaint','opt_out','resend_suppressed','invalid')),
  detail text,
  created_at timestamptz not null default now()
);

-- Webhook idempotency (Resend svix-id).
create table if not exists public.payment_recovery_webhook_events (
  id text primary key,
  provider text not null,
  event_type text not null,
  received_at timestamptz not null default now()
);

-- Admin-only access. The app uses the service role for jobs and webhooks.
do $$
declare t text;
begin
  foreach t in array array[
    'payment_recovery_groups','payment_recovery_attempts','payment_recovery_messages',
    'payment_recovery_events','payment_recovery_bank_confirmations',
    'payment_recovery_suppressions','payment_recovery_webhook_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated
         using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))
         with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = ''admin''))',
      t || '_admin_all', t);
  end loop;
end $$;
