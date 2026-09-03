# Production (Vercel) — why staging works but digitalskillx.com does not

| | Staging | Production |
|---|---------|--------------|
| Host | Coolify | **Vercel** |
| Env vars | Coolify | **Vercel → Settings → Environment Variables** |
| Database | May be staging Supabase | **Production Supabase** (`platform_secrets` row) |

Coolify env vars **do not** apply to production. Keys saved in **staging** Supabase **do not** apply to production Supabase.

Check: `https://www.digitalskillx.com/api/health`

If you see `"cronBootstrapDetail": "... PASTE_…_HERE placeholder"` — production Supabase still has placeholder keys from `PRODUCTION.sql`.

## Fix (5 minutes)

### 1. Add service role to Vercel

1. Open **Supabase Dashboard** for the project used by **www.digitalskillx.com** (check `NEXT_PUBLIC_SUPABASE_URL` in Vercel).
2. **Project Settings → API** → copy **service_role** key (secret).
3. **Vercel** → digitalskillx → **Settings → Environment Variables → Production**:
   - `SUPABASE_SERVICE_ROLE_KEY` = paste service_role key
   - `ZEPTOMAIL_SMTP_PASSWORD` = your ZeptoMail password
   - `PAYSTACK_SECRET_KEY` = your Paystack secret
   - `CRON_SECRET` = your cron secret
   - `ADMIN_EMAIL` = `admin@digitalskillx.com`
   - `ADMIN_PASSWORD` = your admin password
   - `ADMIN_MFA_REQUIRED` = `true` (optional — only when you want authenticator enforced; default is off)
   - `DIGITALSKILLX_FORWARD_SECRET` = shared secret for Leadthur Paystack handoffs (≥32 chars; must match Leadthur)
   - `STAPE_SERVER_URL` = `https://fbvnfwjp.aimoneycode.com.ng` (server-side GA4 purchase events after enrollment)
   - `META_PIXEL_ID` = Meta Pixel ID (Conversions API)
   - `META_CAPI_TOKEN` = Meta Conversions API access token
   - `ADMIN_API_KEY` = server-only key for `POST /api/admin/manual-track-purchase` (`x-admin-key`). Example (generate your own; never reuse this): `86c88158b3bf2f1a7c37939253a9eda5818be81682412b06e3fc90534d7c2275`
4. **Redeploy** (required after env changes).

### Purchase tracking (Paystack → Leadthur → DigitalSkillX)

After a successful external Paystack enrollment, DigitalSkillX fires server-side purchase events to Stape (GA4) and Meta CAPI. These env vars are **required in production** for attribution:

| Variable | Purpose |
|----------|---------|
| `STAPE_SERVER_URL` | Stape tagging server base URL (e.g. `https://fbvnfwjp.aimoneycode.com.ng`). Server posts purchase events to `{STAPE_SERVER_URL}/data` (Data Client). |
| `META_PIXEL_ID` | Meta Pixel ID for Conversions API |
| `META_CAPI_TOKEN` | Meta Conversions API access token |
| `ADMIN_API_KEY` | Protects `POST /api/admin/manual-track-purchase` via `x-admin-key`. Admin UI sends this from the server only. |

Tracking is fail-open: missing credentials or API errors are logged but never block enrollment.

### 2. One-shot setup (after redeploy)

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://www.digitalskillx.com/api/admin/setup-production
```

This saves secrets to `platform_secrets` and syncs the admin password.

### 3. Verify

- `https://www.digitalskillx.com/api/health` → `"supabaseServiceRole": "configured"`
- Admin login at `https://www.digitalskillx.com/admin/login`
- Forgot password sends DigitalSkillX email

## Alternative: SQL only (no Vercel service role env)

Run in **production** Supabase SQL Editor:

```sql
update public.platform_secrets set
  supabase_service_role_key = 'eyJ...your-service-role...',
  zeptomail_smtp_password   = 'your-zeptomail-smtp-password',
  paystack_secret_key       = 'sk_live_...'
where id = 'default';
```

Then ensure Vercel has `CRON_SECRET` matching `platform_settings.cron_auth_secret` and redeploy.
