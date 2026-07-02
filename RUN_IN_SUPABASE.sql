-- ============================================================================
-- DigitalSkillX — STAGING SQL (paste in Supabase → SQL Editor → Run)
-- Project: digitalskillz staging
-- Safe to re-run (idempotent where noted).
-- ============================================================================
--
-- FULL FIRST-TIME SETUP (if DB is empty):
--   Use sql/full-database-setup.sql instead (longer file).
--
-- THIS FILE covers common staging fixes + latest features:
--   1. Make admin user
--   2. Platform settings table (Admin → Settings page)
--
-- ============================================================================


-- ── 1. Make admin@digitalskillx.com an admin ────────────────────────────────

INSERT INTO public.profiles (id, email, full_name, role)
SELECT id, email, 'Platform Admin', 'admin'
FROM auth.users
WHERE lower(email) = 'admin@digitalskillx.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Confirm email (if login says "Email not confirmed")
UPDATE auth.users
SET
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  confirmed_at = coalesce(confirmed_at, now())
WHERE lower(email) = 'admin@digitalskillx.com';


-- ── 2. Platform settings (Admin → Settings page) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id                              text PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  platform_name                   text NOT NULL DEFAULT 'DigitalSkillX',
  logo_url                        text,
  favicon_url                     text,
  primary_color                   text NOT NULL DEFAULT '#dc2626',
  default_timezone                text NOT NULL DEFAULT 'Africa/Lagos',
  email_sender_name               text,
  email_reply_to                  text,
  default_certificate_template_id uuid REFERENCES public.certificate_templates (id) ON DELETE SET NULL,
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  updated_by                      uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'platform_settings_set_updated_at'
  ) THEN
    CREATE TRIGGER platform_settings_set_updated_at
      BEFORE UPDATE ON public.platform_settings
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

INSERT INTO public.platform_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings: admin all" ON public.platform_settings;
CREATE POLICY "platform_settings: admin all" ON public.platform_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "platform_settings: public read branding" ON public.platform_settings;
CREATE POLICY "platform_settings: public read branding" ON public.platform_settings
  FOR SELECT USING (true);


-- ── 3. DeepSeek API key column (AI course copy) ─────────────────────────────

ALTER TABLE public.platform_secrets
  ADD COLUMN IF NOT EXISTS deepseek_api_key text;


-- ── 4. Student checkout transactions (Enroll Now / Paystack) ────────────────

DROP POLICY IF EXISTS "transactions: insert own pending checkout" ON public.transactions;
CREATE POLICY "transactions: insert own pending checkout" ON public.transactions
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_id
        AND c.visibility = 'published'
        AND c.enrollment_type = 'open'
    )
  );


-- ── 5. Quick check (optional — read results below) ─────────────────────────

SELECT
  (SELECT count(*) FROM auth.users WHERE lower(email) = 'admin@digitalskillx.com') AS admin_auth_users,
  (SELECT role FROM public.profiles WHERE lower(email) = 'admin@digitalskillx.com' LIMIT 1) AS admin_role,
  (SELECT count(*) FROM public.platform_settings WHERE id = 'default') AS platform_settings_row;
