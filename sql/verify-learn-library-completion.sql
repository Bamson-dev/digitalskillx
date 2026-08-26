-- READ-ONLY verification for Learn Library completion schema.
-- Run in Supabase SQL Editor. Does not alter data or schema.
-- Expect every "present" column to be true / every expected object to appear.

-- 1) learning_paths columns
select
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default,
  true as expected_by_learn_library_code
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'learning_paths'
  and c.column_name in (
    'artwork_status',
    'artwork_source',
    'artwork_error',
    'artwork_updated_at',
    'estimated_duration_seconds',
    'certificate_pricing_mode',
    'certificate_recommended_price_ngn',
    'certificate_price_reason'
  )
order by c.column_name;

-- 2) Missing expected columns (empty result = all present)
select expected.column_name as missing_column
from (
  values
    ('artwork_status'),
    ('artwork_source'),
    ('artwork_error'),
    ('artwork_updated_at'),
    ('estimated_duration_seconds'),
    ('certificate_pricing_mode'),
    ('certificate_recommended_price_ngn'),
    ('certificate_price_reason')
) as expected(column_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'learning_paths'
 and c.column_name = expected.column_name
where c.column_name is null;

-- 3) learning_path_progress table
select
  to_regclass('public.learning_path_progress') is not null as learning_path_progress_exists;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'learning_path_progress'
order by ordinal_position;

-- 4) Indexes
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'learning_paths_artwork_status_idx',
    'learning_path_progress_student_lesson_uidx',
    'learning_path_progress_device_lesson_uidx',
    'learning_path_progress_path_idx'
  )
order by indexname;

-- 5) RLS enabled?
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'learning_path_progress';

-- 6) Policies
select pol.polname as policy_name, pol.polcmd as command
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'learning_path_progress'
order by pol.polname;

-- 7) Check constraints on learning_paths (names may be auto-generated)
select con.conname, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'learning_paths'
  and pg_get_constraintdef(con.oid) ilike any (array[
    '%artwork_status%',
    '%artwork_source%',
    '%estimated_duration_seconds%',
    '%certificate_pricing_mode%',
    '%certificate_recommended_price_ngn%'
  ])
order by con.conname;

-- 8) Foreign keys on learning_path_progress
select
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table,
  ccu.column_name as foreign_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
where tc.table_schema = 'public'
  and tc.table_name = 'learning_path_progress'
  and tc.constraint_type = 'FOREIGN KEY'
order by tc.constraint_name;
