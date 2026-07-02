-- DigitalSkillX staging — service role key fallback for admin actions (Supabase SQL Editor)
-- Safe to re-run.

alter table public.platform_secrets
  add column if not exists supabase_service_role_key text;

-- Paste your service_role secret from Supabase → Project Settings → API:
-- update public.platform_secrets
-- set supabase_service_role_key = 'YOUR_SERVICE_ROLE_SECRET_HERE'
-- where id = 'default';
