# Contabo self-hosted Supabase (DigitalSkillX)

Digitalskillx production no longer depends on cloud `*.supabase.co`. Auth, Postgres, and PostgREST run on the same Contabo VPS as Coolify.

## Live endpoints

| Item | Value |
|------|--------|
| Public API | `https://supabase.digitalskillx.com` (Kong, port map `:8000`) |
| Coolify service UUID | `lacy7js1uuvik6c2owzr4n4j` |
| Project | AI Money Code → production |
| Public (browser) | `NEXT_PUBLIC_SUPABASE_URL=https://supabase.digitalskillx.com` |
| Server (Docker) | `SUPABASE_URL=http://<kong-app-uuid>:8000` on the Coolify network |
| TLS note | Prefer internal `SUPABASE_URL` for server traffic. `NODE_TLS_REJECT_UNAUTHORIZED=0` is only a fallback for public HTTPS until Let’s Encrypt chain is complete |

## Keys

Coolify generates:

- `SERVICE_SUPABASEANON_KEY` → app `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SERVICE_SUPABASESERVICE_KEY` → app `SUPABASE_SERVICE_ROLE_KEY`
- `SERVICE_PASSWORD_JWT` → must match all `*_JWT_SECRET` vars (materialize `${...}` placeholders if containers exit)

## Schema

Migrations under `supabase/migrations/` were applied via Meta:

```bash
curl -k -X POST "https://supabase.digitalskillx.com/pg/query" \
  -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" \
  -H "Content-Type: application/json" \
  -d '{"query":"..."}'
```

Compose snapshot for disaster recovery: [`docker-compose.supabase.yml`](../docker-compose.supabase.yml) (exported from Coolify).

## Auth redirects

On Contabo GoTrue:

- `GOTRUE_SITE_URL=https://www.digitalskillx.com`
- `ADDITIONAL_REDIRECT_URLS=https://www.digitalskillx.com/**,https://digitalskillx.com/**`

## Backups

Daily dump (Coolify scheduled task or host cron):

```bash
# Inside supabase-db network / with POSTGRES_PASSWORD from Coolify env
pg_dump -Fc -h supabase-db -U postgres postgres \
  > /backups/digitalskillx-$(date +%Y%m%d).dump
```

Or use script: `scripts/backup-contabo-supabase.sh` (run on the VPS with Coolify env).

## Paystack recovery cron

Coolify scheduled task every 15 minutes:

```
GET https://www.digitalskillx.com/api/cron/paystack-external-backfill
Authorization: Bearer $CRON_SECRET
```

## Data migration status

| Dataset | Contabo |
|---------|---------|
| Schema (`supabase/migrations`) | Applied |
| Catalog (`courses` / `modules` / `lessons`) | Restored from cloud (6 / 20 / 92) |
| Learn library (`learning_paths` / sources) | Restored (136 / 160); factory FKs nulled |
| Paid ₦14,999 recoveries | 5 profiles + enrollments + transactions |
| Full `auth.users` + 40k profiles/enrollments | **Deferred** — needs cloud Postgres URI (`pg_dump`) from Supabase Dashboard → Database settings. REST cannot copy password hashes. |

After a successful `pg_dump` / `pg_restore` of `auth` + `public`, re-check row counts against cloud and re-verify the five recovery refs still enroll.

## Cutover checklist

1. Contabo service `running:healthy` (Kong + Auth + DB).
2. `curl -k https://supabase.digitalskillx.com/auth/v1/health` → GoTrue JSON.
3. Digitalskillx detailed `/api/health` → `database: connected`.
4. Login + admin login + Paystack webhook smoke.
5. Keep cloud project paused/read-only until a restore drill succeeds; then decommission.
