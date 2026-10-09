# Contabo / Coolify deployment runbook

This runbook prepares a self-hosted Next.js app container. It does not authorize production deployment, database changes, DNS edits, payment webhook edits, or Vercel schedule changes. Keep Supabase Auth, Postgres/RLS, Storage, identities, purchases, enrollments, payment records and certificates at their currently authoritative location.

## Target architecture

One Dockerized Next.js Node server on the existing Contabo VPS, behind Coolify's HTTPS reverse proxy. The service listens on container port 3000 and Compose only declares it with `expose`; do not publish it to the VPS internet interface. Keep Supabase and existing storage where they are until the live topology is confirmed. Use the existing database queues/outboxes and scheduled route handlers; do not add a separate database or paid queue service for this migration.

Planning estimate only: reserve at least 2 vCPU, 4 GB RAM and 25 GB free disk for a small production app plus image/build headroom; 8 GB RAM is preferable if image builds happen on the VPS. This is not a measurement of the current VPS. Confirm available resources and peak build/runtime memory before deployment. Build on CI or a separate builder if the existing VPS cannot sustain the Next build without affecting production.

## Required configuration

Set the following in Coolify. Do not commit populated env files, pass privileged values as build args, or paste values into tickets/logs.

**Build-time public configuration** (Compose passes only these values as Docker build args):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` (staging origin for staging; canonical HTTPS `www` origin for production)
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` (if enabled)
- `NEXT_PUBLIC_SENTRY_DSN` (if client error reporting is enabled)

**Runtime-only configuration**, copied from the currently working deployment via a secret manager or secure UI, never from source control:

- Supabase: `SUPABASE_SERVICE_ROLE_KEY` and all existing Supabase URL/anon settings; preserve current values in staging-specific form.
- Security and origin: `CRON_SECRET`, `CRON_WORKER_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `NODE_ENV=production`.
- Payment: `PAYSTACK_SECRET_KEY`, existing Paystack currency/product settings; retain `PAYSTACK_WEBHOOK_SECRET`/signature configuration exactly as the application currently expects.
- Email: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, and/or existing `ZEPTOMAIL_*` values.
- Integrations enabled in this installation: `YOUTUBE_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DIGITALSKILLX_FORWARD_SECRET`, and any currently configured storage/S3 variables (`STORAGE_PROVIDER`, `CONTABO_S3_ENDPOINT`, `CONTABO_S3_ACCESS_KEY`, `CONTABO_S3_SECRET_KEY`, bucket/region settings).
- Existing application options: preserve the current configured flags/values for certificates, auth, AI, email campaigns, course content factory, analytics and external payment products. Use the runtime variable names consumed in `process.env`/`runtimeEnv`; compare against the deployed environment without displaying values.

Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`. Do not copy the old environment wholesale until each value is classified as public build-time or server runtime. `.env.production.example` intentionally contains only empty public keys and no credentials.

## Build and deploy to staging

1. Confirm the repository is `Bamson-dev/digitalskillx`, branch `codex/contabo-migration`, and review the exact commit/image digest and working tree. Build only reviewed committed files. Use Node 22 and npm 10.9.2 (`.nvmrc`, `package.json`, `package-lock.json`).
2. In Coolify, create a staging application using the repository and migration branch. Choose Dockerfile build; set context `/`, Dockerfile `Dockerfile`, service/container port `3000`, and expose it only to the Coolify proxy. Set a distinct staging hostname and valid HTTPS certificate.
3. Set staging `NEXT_PUBLIC_*` build args and staging runtime configuration. Use a staging Supabase project if available. If no isolated Supabase exists, do not run mutating integration/auth/payment/cron tests against production data; stop before enabling those functions.
4. Set `CRON_WORKER_ORIGIN` to the staging HTTPS origin and generate a staging-only `CRON_SECRET`. Ensure staging Paystack is test mode, email goes only to an allowlisted controlled test inbox/provider sandbox, and production campaign/marketing jobs are disabled or use empty staging queues. Do not clone production secrets into staging.
5. Build and deploy the image. Check Coolify health and reverse-proxy logs without revealing environment values. Verify TLS externally and `GET https://<staging-host>/api/health` returns healthy. Verify container runs as non-root and port 3000 is not directly internet-accessible.
6. Run staging checks using test accounts: valid and invalid login; email normalization; session cookie persistence across refresh/navigation; logout; password reset to a controlled inbox; redirect allowlist; owned and unowned course access; admin authorization; course/certificate reconciliation error isolation. Browser evidence must confirm the cookie and destination, not just password success.
7. Exercise Paystack test-mode webhook signature, transaction verification and duplicate delivery; verify no duplicate transaction/enrollment/email. Test Leadthur handoff only with controlled fixtures. Test Supabase Storage upload/download against staging and confirm existing production object URLs are unchanged. Test controlled email delivery only.
8. Restart the staging container while a safe durable queue item is pending. Verify database-backed outbox/campaign/bulk/webinar work is reclaimed by its scheduled drain and no duplicate send occurs. Course-publish notifications currently lack a durable outbox and are not restart-safe; do not use that path as evidence of background-job parity until a durable per-recipient queue/idempotency change is implemented and verified. Verify logs do not contain secret values. Confirm app data does not depend on container writable storage; mount a volume only if a verified feature actually needs it.
9. Configure one copy of each cron expression below in Coolify/host cron, UTC. Send `Authorization: Bearer <staging CRON_SECRET>` (or the exact route mechanism) to the staging URL. Start with a harmless/no-due-work observation and confirm exactly one invocation. Prevent Vercel and VPS from running the same environment's schedules simultaneously.

## Cron parity (UTC)

These are the currently committed Vercel schedules; preserve every cadence and do not enable duplicate schedulers:

| Route | UTC schedule |
| --- | --- |
| `/api/cron/inactivity` | `0 9 * * *` |
| `/api/cron/bulk-import` | `15 9 * * *` |
| `/api/cron/email-outbox` | `45 9 * * *` |
| `/api/cron/email-campaigns` | `55 9 * * *` |
| `/api/cron/webinar-follow-up` | `5 8`, `25 10`, `5 11`, `5 13`, `5 15`, `5 17`, `0 14`, `0 18`, `0 20`, `30 21`, `0 22` (each daily) |
| `/api/cron/checkout-abandon` | `20 10 * * *` |
| `/api/cron/content-factory` | `5 10`, `35 12`, `5 15`, `5 18`, `5 21` (each daily) |
| `/api/cron/paystack-external-backfill` | `*/15 * * * *` |

Vercel function durations do not transfer to Node; confirm server/proxy timeouts for long-running routes. Routes use durable database state/idempotency in several flows, but overlap and crash recovery still need staging verification. Do not assume all handlers are safe to overlap.

## Production cutover (approval required)

Do not proceed without explicit approval and a tested rollback.

1. Freeze release inputs: reviewed migration commit and immutable image digest; save the prior Vercel deployment identifier/image and current Coolify config snapshot.
2. Take and verify restorable backups: Supabase database schema/data and Auth records using the provider-supported backup/export process; Supabase Storage object inventory/export or provider snapshot; deployment environment-variable names and encrypted values in the secret manager; DNS records; Vercel deployment and cron configuration. Verify restore to an isolated project and compare row counts/relationships without exposing personal data.
3. Confirm current production app host, authoritative Supabase project, domain registrar/DNS provider, webhook destination, mail provider, and VPS capacity. Do not infer any of these from repo docs.
4. Deploy the exact tested image to the production Coolify app with reviewed runtime values; leave existing Vercel deployment and schedules intact while validating the new origin privately. Validate health, TLS, auth/cookies, student entitlements, admin access, storage, payment test path, email test recipient and cron authorization.
5. Arrange one scheduler owner. During the approved cutover window, disable Vercel cron triggers before enabling equivalent VPS jobs, or vice versa, with a written timestamp and owner. Do not overlap external backfill, campaign, inactivity, webinar, or outbox jobs across hosts.
6. Only after explicit approval, change DNS apex and `www` records to the verified VPS/proxy target and preserve TTL/old values for rollback. Update Supabase Auth Site URL/redirect allowlists and Paystack webhook target only if required and approved. Keep HTTPS and canonical redirects verified.
7. Watch health, auth error rates, cookie refresh, course-entitlement denials, webhook success/duplicate counts, email outbox, cron backlog and VPS resource/disk use. Never send a broad recovery email during migration.
8. Keep the old host/image and backups available through the agreed observation period. Roll back via [rollback plan](CONTABO-ROLLBACK.md) if any acceptance check fails.

## Update and disk operations

- Use immutable image tags or digests; never depend on `latest` for rollback.
- Deploy by building the reviewed commit, checking image digest, then using Coolify's rolling/recreate procedure only after health and staging checks.
- Keep Docker build cache and prior image cleanup deliberate; do not prune the running image, named volumes, or database storage as a routine cleanup.
- Monitor `docker system df`, host disk, memory, CPU, container health, proxy TLS expiry, queue age, DB backup age and storage usage. Keep backups off-host and test restores regularly.
- Compose uses a project-scoped named `digitalskillx-storage` volume at `/app/.data/storage` because the adapter defaults to local filesystem storage. Keep staging and production as distinct Coolify projects so their volumes remain isolated. Back up this volume off-host and test a restore before relying on it. This does not migrate existing Supabase/S3 objects; preserve their URLs and provider.
