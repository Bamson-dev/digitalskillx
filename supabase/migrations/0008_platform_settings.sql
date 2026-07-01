-- ============================================================================
-- Platform settings (admin Settings page — singleton row)
-- ============================================================================

create table if not exists public.platform_settings (
  id                            text primary key default 'default' check (id = 'default'),
  platform_name                 text not null default 'DigitalSkillX',
  logo_url                      text,
  favicon_url                   text,
  primary_color                 text not null default '#dc2626',
  default_timezone              text not null default 'Africa/Lagos',
  email_sender_name             text,
  email_reply_to                text,
  default_certificate_template_id uuid references public.certificate_templates (id) on delete set null,
  updated_at                    timestamptz not null default now(),
  updated_by                    uuid references public.profiles (id) on delete set null
);

create trigger platform_settings_set_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

insert into public.platform_settings (id)
values ('default')
on conflict (id) do nothing;

alter table public.platform_settings enable row level security;

drop policy if exists "platform_settings: admin all" on public.platform_settings;
create policy "platform_settings: admin all" on public.platform_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "platform_settings: public read branding" on public.platform_settings;
create policy "platform_settings: public read branding" on public.platform_settings
  for select using (true);
