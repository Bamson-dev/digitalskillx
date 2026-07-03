-- Allow the app server to load platform_secrets at boot using CRON_SECRET
-- (when Coolify env does not expose SUPABASE_SERVICE_ROLE_KEY to Next.js).

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
