-- Certificate template keys, category mapping, course override, issued template snapshot.
-- Run on Supabase staging. Safe to re-run (idempotent where noted).

-- ── 1. Template key on certificate_templates ───────────────────────────────

alter table public.certificate_templates
  add column if not exists template_key text;

create unique index if not exists certificate_templates_template_key_idx
  on public.certificate_templates (template_key)
  where template_key is not null;

insert into public.certificate_templates (name, template_key, is_default, html_template)
values
  ('Gold Charcoal', 'gold_charcoal', true, 'component'),
  ('Navy Ribbon', 'navy_ribbon', false, 'component'),
  ('Green Gold', 'green_gold', false, 'component')
on conflict do nothing;

-- Upsert by template_key when rows already exist without keys
update public.certificate_templates set template_key = 'gold_charcoal', name = 'Gold Charcoal', html_template = 'component'
where template_key is null and is_default = true
  and not exists (select 1 from public.certificate_templates where template_key = 'gold_charcoal');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Gold Charcoal', 'gold_charcoal', true, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'gold_charcoal');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Navy Ribbon', 'navy_ribbon', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'navy_ribbon');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Green Gold', 'green_gold', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'green_gold');

-- ── 2. Category → template mapping ───────────────────────────────────────────

alter table public.course_categories
  add column if not exists certificate_template_key text
    check (
      certificate_template_key is null
      or certificate_template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

-- ── 3. Per-course override (null = use category default) ─────────────────────

alter table public.courses
  add column if not exists certificate_template_override text
    check (
      certificate_template_override is null
      or certificate_template_override in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );

-- ── 4. Snapshot template on issued certificates ──────────────────────────────

alter table public.certificates
  add column if not exists template_key text
    check (
      template_key is null
      or template_key in ('gold_charcoal', 'navy_ribbon', 'green_gold')
    );
