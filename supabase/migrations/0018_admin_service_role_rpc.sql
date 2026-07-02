-- Admin-only RPC to read service role key (fallback when PostgREST column cache lags).

create or replace function public.admin_get_service_role_key()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  secret text;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  select supabase_service_role_key into secret
  from public.platform_secrets
  where id = 'default';

  return secret;
end;
$$;

revoke all on function public.admin_get_service_role_key() from public;
grant execute on function public.admin_get_service_role_key() to authenticated;
