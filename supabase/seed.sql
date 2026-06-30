-- ============================================================================
-- Seed data (run after migrations, optional)
-- ============================================================================

-- Default course categories
insert into public.course_categories (name, slug) values
  ('General', 'general'),
  ('Facebook Ads', 'facebook-ads'),
  ('Digital Marketing', 'digital-marketing')
on conflict (slug) do nothing;

-- Default certificate template
insert into public.certificate_templates (name, is_default, html_template)
values (
  'Pdigital Default',
  true,
  '<div class="certificate">{{student_name}} — {{course_name}}</div>'
)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Promote the first/admin user.
-- After creating your admin account through the app (or Supabase Auth),
-- run ONE of the following with the real email:
--
--   update public.profiles set role = 'admin' where email = 'bamidele@pdigitalhq.com';
-- ----------------------------------------------------------------------------
