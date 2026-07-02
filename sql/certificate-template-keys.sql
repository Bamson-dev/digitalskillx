-- Certificate template system — paste in Supabase SQL Editor (staging).
-- See supabase/migrations/0012_certificate_template_keys.sql for full migration.

alter table public.certificate_templates
  add column if not exists template_key text;

create unique index if not exists certificate_templates_template_key_idx
  on public.certificate_templates (template_key)
  where template_key is not null;

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Gold Charcoal', 'gold_charcoal', true, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'gold_charcoal');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Navy Ribbon', 'navy_ribbon', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'navy_ribbon');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Green Gold', 'green_gold', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'green_gold');

alter table public.course_categories
  add column if not exists certificate_template_key text
    check (
      certificate_template_key is null
      or certificate_template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

alter table public.courses
  add column if not exists certificate_template_override text
    check (
      certificate_template_override is null
      or certificate_template_override in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

alter table public.certificates
  add column if not exists template_key text
    check (
      template_key is null
      or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );
