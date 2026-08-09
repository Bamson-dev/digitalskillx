-- Phase 8: conversion / commerce growth (additive only)
-- Offers, digital products, relationship kinds, checkout abandonment tracking.
-- Does not rewrite transactions, enrollments, Paystack, or sales pages.
-- Safe on production even if Phase 3 `course_recommendations` was never applied.

-- ── Course recommendations (create if missing, then extend kinds) ─
create table if not exists public.course_recommendations (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  recommended_course_id uuid not null references public.courses (id) on delete cascade,
  kind text not null default 'cross_sell',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint course_recommendations_no_self check (course_id <> recommended_course_id),
  constraint course_recommendations_unique unique (course_id, recommended_course_id, kind)
);

create index if not exists course_recommendations_course_idx
  on public.course_recommendations (course_id, sort_order)
  where active = true;

alter table public.course_recommendations enable row level security;

drop policy if exists course_recommendations_admin_all on public.course_recommendations;
create policy course_recommendations_admin_all on public.course_recommendations
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists course_recommendations_public_read on public.course_recommendations;
create policy course_recommendations_public_read on public.course_recommendations
  for select using (active = true);

alter table public.course_recommendations
  drop constraint if exists course_recommendations_kind_check;

alter table public.course_recommendations
  add constraint course_recommendations_kind_check
  check (kind in (
    'cross_sell', 'upsell', 'downsell', 'related',
    'next_step', 'frequently_bought', 'upgrade', 'bundle_component', 'recommended'
  ));

-- ── Digital products (minimal fulfillment layer) ────────────────
create table if not exists public.digital_products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  price_ngn integer not null default 0 check (price_ngn >= 0),
  price_usd numeric(12,2) not null default 0 check (price_usd >= 0),
  access_instructions text not null default '',
  download_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists digital_products_active_idx
  on public.digital_products (is_active, updated_at desc);

alter table public.digital_products enable row level security;

drop policy if exists digital_products_admin_all on public.digital_products;
create policy digital_products_admin_all on public.digital_products
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists digital_products_public_read_active on public.digital_products;
create policy digital_products_public_read_active on public.digital_products
  for select using (is_active = true);

create table if not exists public.digital_product_entitlements (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  digital_product_id uuid not null references public.digital_products (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (student_id, digital_product_id)
);

create index if not exists digital_product_entitlements_student_idx
  on public.digital_product_entitlements (student_id);

alter table public.digital_product_entitlements enable row level security;

drop policy if exists digital_product_entitlements_admin_all on public.digital_product_entitlements;
create policy digital_product_entitlements_admin_all on public.digital_product_entitlements
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists digital_product_entitlements_own_read on public.digital_product_entitlements;
create policy digital_product_entitlements_own_read on public.digital_product_entitlements
  for select using (student_id = auth.uid());

-- ── Commerce offers ─────────────────────────────────────────────
create table if not exists public.commerce_offers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  offer_type text not null default 'standard'
    check (offer_type in (
      'standard', 'discount', 'bundle', 'upgrade', 'cross_sell', 'post_purchase'
    )),
  target_type text not null
    check (target_type in ('course', 'bundle', 'digital_product')),
  target_id uuid not null,
  price_ngn integer not null check (price_ngn >= 0),
  original_price_ngn integer check (original_price_ngn is null or original_price_ngn >= 0),
  cta_text text not null default 'Buy now',
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order integer not null default 0,
  sales_page_course_id uuid references public.courses (id) on delete set null,
  coupon_code text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commerce_offers_window check (
    starts_at is null or ends_at is null or starts_at <= ends_at
  )
);

create index if not exists commerce_offers_active_idx
  on public.commerce_offers (is_active, sort_order, updated_at desc);

create index if not exists commerce_offers_target_idx
  on public.commerce_offers (target_type, target_id);

create index if not exists commerce_offers_sales_page_idx
  on public.commerce_offers (sales_page_course_id)
  where sales_page_course_id is not null;

alter table public.commerce_offers enable row level security;

drop policy if exists commerce_offers_admin_all on public.commerce_offers;
create policy commerce_offers_admin_all on public.commerce_offers
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists commerce_offers_public_read_active on public.commerce_offers;
create policy commerce_offers_public_read_active on public.commerce_offers
  for select using (
    is_active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  );

create table if not exists public.commerce_offer_related (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.commerce_offers (id) on delete cascade,
  related_course_id uuid not null references public.courses (id) on delete cascade,
  sort_order integer not null default 0,
  unique (offer_id, related_course_id)
);

create index if not exists commerce_offer_related_offer_idx
  on public.commerce_offer_related (offer_id, sort_order);

alter table public.commerce_offer_related enable row level security;

drop policy if exists commerce_offer_related_admin_all on public.commerce_offer_related;
create policy commerce_offer_related_admin_all on public.commerce_offer_related
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists commerce_offer_related_public_read on public.commerce_offer_related;
create policy commerce_offer_related_public_read on public.commerce_offer_related
  for select using (
    exists (
      select 1 from public.commerce_offers o
      where o.id = offer_id and o.is_active = true
    )
  );

-- ── Transaction commerce refs (nullable additive) ───────────────
-- Ensure bundles table exists before FK (Phase 5 may be missing on some DBs)
create table if not exists public.course_bundles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  price_ngn integer not null default 0 check (price_ngn >= 0),
  price_usd numeric(12,2) not null default 0 check (price_usd >= 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.course_bundles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  sort_order integer not null default 0,
  unique (bundle_id, course_id)
);

alter table public.transactions
  alter column course_id drop not null;

alter table public.transactions
  add column if not exists offer_id uuid references public.commerce_offers (id) on delete set null;

alter table public.transactions
  add column if not exists bundle_id uuid references public.course_bundles (id) on delete set null;

alter table public.transactions
  add column if not exists digital_product_id uuid references public.digital_products (id) on delete set null;

do $$ begin
  alter table public.transactions
    add constraint transactions_commerce_target_check
    check (
      course_id is not null
      or bundle_id is not null
      or digital_product_id is not null
    );
exception when duplicate_object then null;
end $$;

create index if not exists transactions_offer_idx on public.transactions (offer_id)
  where offer_id is not null;
create index if not exists transactions_bundle_idx on public.transactions (bundle_id)
  where bundle_id is not null;
create index if not exists transactions_digital_idx on public.transactions (digital_product_id)
  where digital_product_id is not null;

-- Pending checkout abandonment reminders (idempotent)
create table if not exists public.checkout_abandon_reminders (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete set null,
  email text not null,
  sent_at timestamptz not null default now(),
  unique (transaction_id)
);

create index if not exists checkout_abandon_reminders_sent_idx
  on public.checkout_abandon_reminders (sent_at desc);

alter table public.checkout_abandon_reminders enable row level security;

drop policy if exists checkout_abandon_reminders_admin_all on public.checkout_abandon_reminders;
create policy checkout_abandon_reminders_admin_all on public.checkout_abandon_reminders
  for all using (public.is_admin()) with check (public.is_admin());

-- Automation trigger value (safe if already present)
do $$ begin
  alter type public.automation_trigger add value if not exists 'checkout_abandoned';
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
