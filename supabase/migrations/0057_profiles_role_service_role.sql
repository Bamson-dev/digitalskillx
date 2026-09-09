-- Allow service_role to change profiles.role / is_suspended.
-- Client privilege escalation remains blocked for anon/authenticated.

create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role and auth.role() is distinct from 'service_role' then
      raise exception 'profiles.role cannot be changed by clients';
    end if;
    if new.is_suspended is distinct from old.is_suspended
       and not public.is_admin()
       and auth.role() is distinct from 'service_role' then
      raise exception 'profiles.is_suspended cannot be changed by non-admins';
    end if;
  end if;
  return new;
end;
$$;
