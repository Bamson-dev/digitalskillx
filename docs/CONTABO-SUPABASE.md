# Contabo self-hosted Supabase (DigitalSkillX)

Digitalskillx production no longer depends on cloud `*.supabase.co`. Auth, Postgres, and PostgREST run on the same Contabo VPS as Coolify.

## Live endpoints

| Item | Value |
|------|--------|
| Public API | `https://supabase.digitalskillx.com` (Kong; no public DNS — Docker bridge) |
| Coolify service UUID | `lacy7js1uuvik6c2owzr4n4j` |
| Browser Auth | `NEXT_PUBLIC_SUPABASE_URL=https://www.digitalskillx.com/api/sb` (same-origin proxy) |
| Server Auth cookies | Pinned `sb-www-auth-token` via `lib/supabase/auth-cookie.ts` (never derive from Kong hostname) |
| Server data plane | `SUPABASE_URL=https://supabase.digitalskillx.com` + `SUPABASE_DOCKER_DNS=coolify-proxy` |
| Middleware Auth | Prefer `SUPABASE_LOOPBACK_URL=http://127.0.0.1:3000/api/sb` (avoids public hairpin) |
| TLS | `NODE_TLS_REJECT_UNAUTHORIZED=0` until Let’s Encrypt chain is complete |

Compose snapshot: [`docker-compose.supabase.yml`](../docker-compose.supabase.yml).

## Keys

Coolify generates:

- `SERVICE_SUPABASEANON_KEY` → app `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SERVICE_SUPABASESERVICE_KEY` → app `SUPABASE_SERVICE_ROLE_KEY`
- `SERVICE_PASSWORD_JWT` → must match all `*_JWT_SECRET` vars (materialize `${...}` placeholders if containers exit)

## Auth redirects

On Contabo GoTrue:

- `GOTRUE_SITE_URL=https://www.digitalskillx.com`
- `ADDITIONAL_REDIRECT_URLS=https://www.digitalskillx.com/**,https://digitalskillx.com/**`

## Backups

Daily host/VPS cron (not inside the Next.js container):

```bash
export POSTGRES_PASSWORD=...   # SERVICE_PASSWORD_POSTGRES from Coolify Supabase
export POSTGRES_HOST=<supabase-db container name or IP on docker network>
./scripts/backup-contabo-supabase.sh
```

Keep last 14 dumps under `/var/lib/coolify/backups/digitalskillx-supabase`.

## Paystack recovery cron

Coolify app scheduled task every 15 minutes (`paystack-external-backfill`):

```bash
# Inside Digitalskillx container (uses $CRON_SECRET from app env)
wget/curl http://127.0.0.1:3000/api/cron/paystack-external-backfill
```

Helper: `scripts/cron-paystack-external-backfill.sh`.

## Data migration status

| Dataset | Contabo |
|---------|---------|
| Schema (`supabase/migrations`) | Applied |
| Catalog (`courses` / `modules` / `lessons`) | Restored from cloud (6 / 20 / 92) |
| Learn library (`learning_paths` / sources) | Restored (136 / 160); factory FKs nulled |
| Paid ₦14,999 recoveries + ongoing backfill | Contabo enrollments active |
| Full `auth.users` + historical ~40k profiles | **Deferred** — needs cloud Postgres URI (`pg_dump`). REST cannot copy password hashes. |

After a full `pg_dump` / `pg_restore`, re-check row counts vs cloud. Keep cloud paused/read-only for 48h, then decommission.

## Cutover checklist

1. Contabo service `running:healthy` (Kong + Auth + DB).
2. `curl -k https://supabase.digitalskillx.com/auth/v1/health` → GoTrue JSON.
3. Digitalskillx detailed `/api/health` → `database: connected` (fast).
4. Login + admin login + Paystack webhook / backfill smoke.
5. Cloud project paused until restore drill succeeds; then decommission.
