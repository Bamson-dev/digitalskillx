-- Supabase service role key in platform_secrets (fallback when Coolify env does not reach Next.js).

alter table public.platform_secrets
  add column if not exists supabase_service_role_key text;

-- After running, set your key (replace with service_role secret from Supabase → Settings → API):
-- update public.platform_secrets
-- set supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
-- where id = 'default';
