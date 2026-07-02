-- ============================================================================
-- Seed data (run after migrations, optional)
-- ============================================================================

-- Default course categories
insert into public.course_categories (name, slug) values
  ('General', 'general'),
  ('Facebook Ads', 'facebook-ads'),
  ('Digital Marketing', 'digital-marketing')
on conflict (slug) do nothing;

-- Built-in certificate templates (code-rendered; no uploads)
insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Gold Charcoal', 'gold_charcoal', true, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'gold_charcoal');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Navy Ribbon', 'navy_ribbon', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'navy_ribbon');

insert into public.certificate_templates (name, template_key, is_default, html_template)
select 'Green Gold', 'green_gold', false, 'component'
where not exists (select 1 from public.certificate_templates where template_key = 'green_gold');

-- ----------------------------------------------------------------------------
-- Promote the first/admin user.
-- After creating your admin account through the app (or Supabase Auth),
-- run ONE of the following with the real email:
--
--   update public.profiles set role = 'admin' where email = 'bamidele@pdigitalhq.com';
-- ----------------------------------------------------------------------------
