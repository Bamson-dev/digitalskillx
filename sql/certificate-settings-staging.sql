-- Certificate settings cleanup for Supabase staging.
-- Run in SQL Editor. Safe to re-run.

-- ── 1. Category template mapping ─────────────────────────────────────────────

alter table public.course_categories
  add column if not exists template_key text
    check (
      template_key is null
      or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

-- Copy from legacy column name if present
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'course_categories'
      and column_name = 'certificate_template_key'
  ) then
    update public.course_categories
    set template_key = certificate_template_key
    where template_key is null
      and certificate_template_key is not null;
  end if;
end $$;

-- ── 2. Course override ───────────────────────────────────────────────────────

alter table public.courses
  add column if not exists certificate_template_override text
    check (
      certificate_template_override is null
      or certificate_template_override in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

-- ── 3. Global default (platform_settings) ────────────────────────────────────

alter table public.platform_settings
  add column if not exists default_certificate_template_key text
    check (
      default_certificate_template_key is null
      or default_certificate_template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

update public.platform_settings
set default_certificate_template_key = coalesce(default_certificate_template_key, 'gold_charcoal')
where id = 'default';

insert into public.platform_settings (id, platform_name, default_certificate_template_key)
select 'default', 'DigitalSkillX', 'gold_charcoal'
where not exists (select 1 from public.platform_settings where id = 'default');

-- ── 4. Issued certificate snapshot ───────────────────────────────────────────

alter table public.certificates
  add column if not exists template_key text
    check (
      template_key is null
      or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

-- ── 5. Remove legacy uploaded templates (Pdigital Default, etc.) ───────────────

delete from public.certificate_templates
where template_key is null
   or template_key not in ('gold_charcoal', 'navy_ribbon', 'green_gold')
   or name ilike '%Pdigital Default%';

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Gold Charcoal', 'gold_charcoal', true, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'gold_charcoal');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Navy Ribbon', 'navy_ribbon', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'navy_ribbon');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Green Gold', 'green_gold', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'green_gold');

update public.platform_settings
set default_certificate_template_id = null
where id = 'default';
