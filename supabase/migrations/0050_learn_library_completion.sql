-- Learn Library completion schema (artwork status + certificate pricing + server progress).
-- Numbered 0050 because 0046 is already used by 0046_email_campaigns.sql.
--
-- PRODUCTION NOTE:
-- This SQL was previously pasted manually into the Supabase SQL Editor on production
-- (content formerly drafted as 0046_learn_library_completion.sql). Do NOT paste/run this
-- again on production until sql/verify-learn-library-completion.sql confirms something
-- is missing. All statements are idempotent (IF NOT EXISTS / drop-if-exists policies)
-- so a later CLI migration apply on an already-updated production DB should be a no-op.
--
-- Safe for existing production data. Does not DROP/TRUNCATE. Does not rewrite certificate rows.

alter table public.learning_paths
  add column if not exists artwork_status text
    check (
      artwork_status is null
      or artwork_status in (
        'generated',
        'processing',
        'retrying',
        'source_thumbnail',
        'category_fallback',
        'failed',
        'missing'
      )
    );

alter table public.learning_paths
  add column if not exists artwork_source text
    check (
      artwork_source is null
      or artwork_source in ('openai', 'youtube', 'category', 'manual')
    );

alter table public.learning_paths
  add column if not exists artwork_error text;

alter table public.learning_paths
  add column if not exists artwork_updated_at timestamptz;

alter table public.learning_paths
  add column if not exists estimated_duration_seconds integer
    check (estimated_duration_seconds is null or estimated_duration_seconds >= 0);

alter table public.learning_paths
  add column if not exists certificate_pricing_mode text
    not null default 'automatic'
    check (certificate_pricing_mode in ('automatic', 'fixed', 'free'));

alter table public.learning_paths
  add column if not exists certificate_recommended_price_ngn integer
    check (
      certificate_recommended_price_ngn is null
      or certificate_recommended_price_ngn in (0, 2000, 3000, 5000, 7500)
    );

alter table public.learning_paths
  add column if not exists certificate_price_reason text;

create index if not exists learning_paths_artwork_status_idx
  on public.learning_paths (artwork_status)
  where artwork_status is not null;

-- Device- or student-scoped Learn progress (server-side eligibility).
create table if not exists public.learning_path_progress (
  id uuid primary key default gen_random_uuid(),
  learning_path_id uuid not null references public.learning_paths (id) on delete cascade,
  lesson_id uuid not null references public.learning_path_lessons (id) on delete cascade,
  student_id uuid references public.profiles (id) on delete cascade,
  device_key text,
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_path_progress_owner_check check (
    student_id is not null or (device_key is not null and length(trim(device_key)) >= 8)
  )
);

create unique index if not exists learning_path_progress_student_lesson_uidx
  on public.learning_path_progress (student_id, lesson_id)
  where student_id is not null;

create unique index if not exists learning_path_progress_device_lesson_uidx
  on public.learning_path_progress (device_key, lesson_id)
  where student_id is null and device_key is not null;

create index if not exists learning_path_progress_path_idx
  on public.learning_path_progress (learning_path_id);

alter table public.learning_path_progress enable row level security;

drop policy if exists learning_path_progress_own_select on public.learning_path_progress;
create policy learning_path_progress_own_select
  on public.learning_path_progress for select to authenticated
  using (student_id = auth.uid());

drop policy if exists learning_path_progress_own_write on public.learning_path_progress;
create policy learning_path_progress_own_write
  on public.learning_path_progress for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

drop policy if exists learning_path_progress_admin_all on public.learning_path_progress;
create policy learning_path_progress_admin_all
  on public.learning_path_progress for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
