-- Library Build throughput + continuous expansion (additive only)
-- Apply after 0051 library build engine tables exist.

alter table public.library_build_settings
  add column if not exists continuous_expansion_enabled boolean not null default true,
  add column if not exists discovery_backlog_target integer not null default 4
    check (discovery_backlog_target >= 1 and discovery_backlog_target <= 20),
  add column if not exists max_concurrent_discovery_jobs integer not null default 3
    check (max_concurrent_discovery_jobs >= 1 and max_concurrent_discovery_jobs <= 10),
  add column if not exists qualification_batch_size integer not null default 3
    check (qualification_batch_size >= 1 and qualification_batch_size <= 10),
  add column if not exists generation_batch_size integer not null default 40
    check (generation_batch_size >= 1 and generation_batch_size <= 100),
  add column if not exists publication_batch_size integer not null default 6
    check (publication_batch_size >= 1 and publication_batch_size <= 50),
  add column if not exists expansion_max_per_day integer not null default 24
    check (expansion_max_per_day >= 0 and expansion_max_per_day <= 200),
  add column if not exists stall_recovery_minutes integer not null default 45
    check (stall_recovery_minutes >= 5 and stall_recovery_minutes <= 1440),
  add column if not exists last_successful_activity_at timestamptz,
  add column if not exists last_error text,
  add column if not exists last_error_at timestamptz;

alter table public.library_build_settings drop constraint if exists library_build_settings_build_mode_check;
alter table public.library_build_settings add constraint library_build_settings_build_mode_check
  check (build_mode in ('bulk', 'maintenance', 'expansion', 'continuous', 'paused', 'stopped'));

update public.library_build_settings
set
  build_mode = 'continuous',
  run_status = case when run_status = 'completed' then 'running' else run_status end,
  completed_at = null,
  updated_at = now()
where id = 'default'
  and continuous_expansion_enabled = true
  and run_status in ('running', 'completed')
  and build_mode in ('maintenance', 'bulk')
  and target_published_count is not null
  and (
  select count(*)::int from public.learning_paths lp where lp.status = 'published'
) >= library_build_settings.target_published_count;
