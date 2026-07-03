-- Run once in Supabase SQL Editor (production).
-- Lets the app load platform_secrets at boot when only CRON_SECRET is in Coolify env.

alter table public.platform_settings
  add column if not exists cron_auth_secret text;

create or replace function public.server_bootstrap_platform_secrets(p_cron_secret text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  expected text;
  row public.platform_secrets%rowtype;
begin
  select cron_auth_secret into expected
  from public.platform_settings
  where id = 'default';

  if expected is null or expected = '' or p_cron_secret is null or p_cron_secret = '' then
    return null;
  end if;

  if p_cron_secret <> expected then
    return null;
  end if;

  select * into row from public.platform_secrets where id = 'default';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'supabase_service_role_key', row.supabase_service_role_key,
    'paystack_secret_key', row.paystack_secret_key,
    'zeptomail_smtp_password', row.zeptomail_smtp_password,
    'youtube_api_key', row.youtube_api_key,
    'deepseek_api_key', row.deepseek_api_key
  );
end;
$$;

revoke all on function public.server_bootstrap_platform_secrets(text) from public;
grant execute on function public.server_bootstrap_platform_secrets(text) to anon, authenticated, service_role;

-- Set to the SAME value as CRON_SECRET in Vercel (or Coolify):
-- update public.platform_settings
-- set cron_auth_secret = 'your-cron-secret-here'
-- where id = 'default';

-- Verify (run after updates above):
-- select
--   (select proname from pg_proc where proname = 'server_bootstrap_platform_secrets') as rpc_ready,
--   (select cron_auth_secret is not null and length(cron_auth_secret) > 0
--      from public.platform_settings where id = 'default') as cron_token_set,
--   (select supabase_service_role_key is not null
--      and supabase_service_role_key not like 'PASTE_%'
--    from public.platform_secrets where id = 'default') as service_role_saved;
