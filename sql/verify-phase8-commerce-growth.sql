-- Phase 8 production schema verification (read-only)
-- Run in Supabase SQL Editor on DigitalSkillX production, then paste results.

-- 1) Required tables
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'commerce_offers',
    'commerce_offer_related',
    'digital_products',
    'digital_product_entitlements',
    'checkout_abandon_reminders',
    'course_recommendations',
    'course_bundles',
    'course_bundle_items'
  )
order by 1;

-- 2) Transaction commerce columns
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'transactions'
  and column_name in ('course_id', 'offer_id', 'bundle_id', 'digital_product_id')
order by 1;

-- 3) Key indexes
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'course_recommendations_course_idx',
    'digital_products_active_idx',
    'digital_product_entitlements_student_idx',
    'commerce_offers_active_idx',
    'commerce_offers_target_idx',
    'commerce_offers_sales_page_idx',
    'commerce_offer_related_offer_idx',
    'transactions_offer_idx',
    'transactions_bundle_idx',
    'transactions_digital_idx',
    'checkout_abandon_reminders_sent_idx'
  )
order by 1;

-- 4) Constraints
select conname
from pg_constraint
where conname in (
  'course_recommendations_kind_check',
  'transactions_commerce_target_check',
  'commerce_offers_window'
)
order by 1;

-- 5) RLS enabled
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'commerce_offers',
    'commerce_offer_related',
    'digital_products',
    'digital_product_entitlements',
    'checkout_abandon_reminders',
    'course_recommendations'
  )
order by 1;

-- 6) Policies
select tablename, policyname
from pg_policies
where schemaname = 'public'
  and tablename in (
    'commerce_offers',
    'commerce_offer_related',
    'digital_products',
    'digital_product_entitlements',
    'checkout_abandon_reminders',
    'course_recommendations'
  )
order by 1, 2;
