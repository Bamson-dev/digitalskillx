# Production: DigitalSkillX auth emails (ZeptoMail)

All student auth emails are sent by **your app** through ZeptoMail — not Supabase Auth.

| Flow | How it works |
|------|----------------|
| Sign up | Service role creates account + welcome email |
| Forgot password | `generateLink` + ZeptoMail reset template |
| Magic link | `generateLink` + ZeptoMail sign-in template |
| Admin reset | ZeptoMail welcome-style email with new password |

You do **not** need Supabase Dashboard → Custom SMTP.

## Requirements

1. **`platform_secrets`** (or Coolify runtime env):
   - `supabase_service_role_key` — required for `generateLink` and account creation
   - `zeptomail_smtp_password` — required for sending

2. **`NEXT_PUBLIC_SITE_URL`** = `https://digitalskillx.com` on production (reset/magic links use this origin).

3. **Supabase → Authentication → URL Configuration** — add:
   - `https://digitalskillx.com/auth/callback`
   - `https://digitalskillx.com/reset-password`

## Checklist

- [ ] ZeptoMail + service role keys saved (SQL or Admin → Integrations)
- [ ] Production redeployed from `main`
- [ ] Register → welcome from **DigitalSkillX**
- [ ] Forgot password → reset from **DigitalSkillX** (no Supabase footer)
- [ ] Magic link → sign-in from **DigitalSkillX**
