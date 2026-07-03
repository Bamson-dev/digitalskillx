# Production on Vercel (digitalskillx.com)

**Staging** may run on Coolify — env vars there do **not** apply to production.

Production (`www.digitalskillx.com`) runs on **Vercel** (`cwd: /var/task`). Check: https://www.digitalskillx.com/api/health → `"deployment": "vercel"`.

## Required Vercel env vars (Production)

Vercel → your project → **Settings** → **Environment Variables** → scope **Production** → **Redeploy**.

| Variable | Where to get it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → **service_role** (secret) |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `ADMIN_EMAIL` | e.g. `admin@digitalskillx.com` |
| `ADMIN_PASSWORD` | your admin login password |
| `ZEPTOMAIL_SMTP_PASSWORD` | ZeptoMail |
| `PAYSTACK_SECRET_KEY` | Paystack |
| `NEXT_PUBLIC_SITE_URL` | `https://www.digitalskillx.com` |

## After redeploy

1. Health: `https://www.digitalskillx.com/api/health` → `supabaseServiceRole: "configured"`
2. Sync admin password:
   ```bash
   curl -X POST \
     -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://www.digitalskillx.com/api/admin/sync-password
   ```
3. Admin login: https://www.digitalskillx.com/admin/login

## Optional: load secrets from Supabase DB (like staging)

If keys live in `platform_secrets` only:

1. Run `sql/server-bootstrap-platform-secrets.sql` in Supabase SQL Editor
2. Set bootstrap token (same as Vercel `CRON_SECRET`):
   ```sql
   update public.platform_settings
   set cron_auth_secret = 'your-cron-secret'
   where id = 'default';
   ```
3. Ensure real keys in `platform_secrets` (not `PASTE_…_HERE` placeholders)

Still add `CRON_SECRET` to Vercel — required for bootstrap without service role in env.
