# Production: DigitalSkillX-branded auth emails (Supabase)

Signup now uses **DigitalSkillX welcome email** (ZeptoMail) — no Supabase confirm email.

Password reset and magic-link emails still go through **Supabase Auth** until you configure custom SMTP in the Supabase dashboard (one-time, ~5 minutes).

## Remove "powered by Supabase" on reset / magic-link emails

In your **production** Supabase project:

1. **Project Settings → Authentication → SMTP Settings**
2. Enable **Custom SMTP**
3. Use your ZeptoMail credentials:

| Field | Value |
|-------|--------|
| Host | `smtp.zeptomail.com` |
| Port | `587` |
| Username | `emailapikey` (or ZeptoMail SMTP user) |
| Password | Your ZeptoMail SMTP password (same as Integrations) |
| Sender email | `courses@digitalskillx.com` (or your verified ZeptoMail sender) |
| Sender name | `DigitalSkillX` |

4. Save

## Customize email templates (optional)

**Authentication → Email Templates** — edit each template:

- **Confirm signup** — not used for self-register anymore (welcome email replaces it)
- **Reset password** — set subject to `Reset your DigitalSkillX password`
- **Magic link** — set subject to `Sign in to DigitalSkillX`

Replace body copy with your branding; remove any Supabase references.

## Checklist

- [ ] `platform_secrets.zeptomail_smtp_password` saved (SQL or Admin → Integrations)
- [ ] Supabase **Custom SMTP** enabled (reset / magic-link branding)
- [ ] `NEXT_PUBLIC_SITE_URL=https://digitalskillx.com` on production deploy
- [ ] Test: Register → welcome from **DigitalSkillX**, not Supabase Auth
- [ ] Test: Forgot password → email from **DigitalSkillX** sender
