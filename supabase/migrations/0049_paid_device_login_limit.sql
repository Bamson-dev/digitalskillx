-- Paid-program device login limit (default 4 devices per student).
-- Free-only students are not limited in app code.

alter table public.profiles
  add column if not exists max_devices integer;

alter table public.profiles
  drop constraint if exists profiles_max_devices_check;
alter table public.profiles
  add constraint profiles_max_devices_check
  check (max_devices is null or (max_devices >= 1 and max_devices <= 50));

comment on column public.profiles.max_devices is
  'Optional override for paid-program device login cap. Null = platform default (4). Free-only students ignore this.';

alter table public.account_sessions
  add column if not exists device_key text;

create index if not exists account_sessions_user_device_key_idx
  on public.account_sessions (user_id, device_key)
  where revoked_at is null and device_key is not null;

comment on column public.account_sessions.device_key is
  'Stable browser/device fingerprint (cookie). Used to count unique devices for paid login limits.';
