-- Run this first in Supabase SQL Editor to see what is already applied.
-- Do NOT re-run apply-all-migrations.sql if has_user_role = true.

select
  exists (select 1 from pg_type where typname = 'user_role') as has_user_role,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) as has_profiles,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'courses'
  ) as has_courses,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'price_ngn'
  ) as has_price_ngn,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'price_usd'
  ) as has_price_usd,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transactions'
  ) as has_transactions,
  exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'support_requests'
  ) as has_support_requests,
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ) as has_is_admin;
