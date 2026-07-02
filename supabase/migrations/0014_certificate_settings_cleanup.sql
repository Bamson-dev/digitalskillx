-- Certificate settings: template_key columns, global default, remove legacy templates.

alter table public.course_categories
  add column if not exists template_key text
    check (
      template_key is null
      or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

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

alter table public.platform_settings
  add column if not exists default_certificate_template_key text
    check (
      default_certificate_template_key is null
      or default_certificate_template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

update public.platform_settings
set default_certificate_template_key = coalesce(default_certificate_template_key, 'gold_charcoal')
where id = 'default';

delete from public.certificate_templates
where template_key is null
   or template_key not in ('gold_charcoal', 'navy_ribbon', 'green_gold')
   or name ilike '%Pdigital Default%';
