-- Production security hardening — run manually in Supabase SQL Editor after
-- sql/apply-production-stability.sql (or together with it).
-- Do not skip: public platform_settings SELECT currently exposes cron_auth_secret.

-- 1) Prevent students from escalating role / clearing suspension via client UPDATE.
create or replace function public.profiles_prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      raise exception 'profiles.role cannot be changed by clients';
    end if;
    if new.is_suspended is distinct from old.is_suspended
       and not public.is_admin() then
      raise exception 'profiles.is_suspended cannot be changed by non-admins';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row
  execute function public.profiles_prevent_privilege_escalation();

-- 2) Stop world-readable platform_settings (leaks cron_auth_secret → secret dump via RPC).
drop policy if exists "platform_settings: public read branding" on public.platform_settings;

drop policy if exists "platform_settings: admin all" on public.platform_settings;
create policy "platform_settings: admin all"
  on public.platform_settings
  for all
  using (public.is_admin())
  with check (public.is_admin());

-- Safe public branding view (no cron_auth_secret).
create or replace view public.platform_branding
with (security_invoker = false)
as
select
  id,
  platform_name,
  logo_url,
  favicon_url,
  primary_color,
  default_timezone,
  email_sender_name,
  email_reply_to,
  default_certificate_template_id,
  default_certificate_template_key,
  updated_at
from public.platform_settings
where id = 'default';

grant select on public.platform_branding to anon, authenticated;

comment on view public.platform_branding is
  'Public branding fields only. Never expose cron_auth_secret.';

-- Keep server_bootstrap_platform_secrets executable by anon (Coolify/Vercel CRON bootstrap),
-- but only with the matching CRON_SECRET that is no longer readable via SELECT.
-- Attackers without CRON_SECRET cannot dump platform_secrets.

-- 4) Self-enroll RLS: only free published courses (blocks paid bypass via client INSERT).
drop policy if exists "enrollments: self-enroll open courses" on public.enrollments;
create policy "enrollments: self-enroll open courses"
  on public.enrollments
  for insert
  with check (
    student_id = auth.uid()
    and source = 'self'
    and exists (
      select 1
      from public.courses c
      where c.id = course_id
        and c.enrollment_type = 'open'
        and c.visibility = 'published'
        and coalesce(c.is_coming_soon, false) = false
        and coalesce(c.price_ngn, 0) <= 0
    )
  );
