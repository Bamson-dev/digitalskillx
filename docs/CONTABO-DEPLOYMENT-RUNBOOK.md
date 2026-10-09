# Contabo / Coolify deployment runbook

This runbook configures a self-hosted Next.js app container and an automated release path. Keep Supabase Auth, Postgres/RLS, Storage, identities, purchases, enrollments, payment records and certificates at their currently authoritative location. Do not apply schema migrations automatically as part of a code release.

## Verified live topology (2026-10-09)

- Public DNS A records for `digitalskillx.com` and `www.digitalskillx.com` resolve to `207.180.248.233`, the Coolify Contabo server. Both HTTPS `/api/health` checks returned HTTP 200 with certificate verification enabled. Coolify's matching production app is `digitalskillx:main`, app UUID `ay1sfm49mfbzm1x1a6pil8tm`, with the same domains. Therefore public web traffic is currently routed through Contabo/Coolify. Vercel still has a production project/deployment and the domains attached, but it is not the current apex/`www` DNS target.
- The Coolify app points at GitHub `main` and its latest visible successful deployment is commit `0ab7201dd8377ee701c172de10c1e984f0c2e702` (2026-09-29). GitHub `main` is newer (`b99da43732749fa9a665644a710c72404b3b75fa`). Coolify's `Auto Deploy` switch is enabled, but the GitHub repository has no webhook configured; the latest deployment was manual. Automatic deployments are not active yet.
- The current app has a Coolify HTTP health check on `localhost:3000/api/health`, force HTTPS enabled, exposed container port `3000`, and no Coolify persistent-storage mount. Coolify reports Ubuntu 24.04.4 with 6 CPU cores and 11.7 GB RAM; disk availability and actual app/container resource use have not been verified.
- The deployed Dockerfile at commit `0ab7201…` has no non-root `USER`, so Docker defaults to root. The migration branch image specifies `USER node`, but it is not live yet. The Coolify administration UI was reachable over plain HTTP on port 8000; restrict it to a trusted network or verified HTTPS before hardening sign-off. This management-plane change is not part of the release workflow.
- Vercel Cron is enabled with 22 scheduled invocations; Coolify lists 8 DigitalSkillX application cron tasks with overlapping routes. Exact Coolify task commands/cadences and actual invocations have not been inspected, so both duplicate execution and missing cadence risk remain. Do not create or change schedules until each workload's owner and recent invocations are reconciled. Preserve existing jobs during that investigation.
- Coolify also contains a `digitalskillx:staging` app in an environment labelled `production`, and its health is `unknown`. Do not use it as staging until its Supabase target, secrets, domain, and scheduler ownership are verified as isolated.

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
- Security and origin: `CRON_SECRET`, `CRON_WORKER_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `NODE_ENV=production`, `DIGITALSKILLX_DEPLOYMENT_ENV=production` (use `staging` in staging).
- Payment: `PAYSTACK_SECRET_KEY`, existing Paystack currency/product settings; retain `PAYSTACK_WEBHOOK_SECRET`/signature configuration exactly as the application currently expects.
- Email: `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, and/or existing `ZEPTOMAIL_*` values.
- Integrations enabled in this installation: `YOUTUBE_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DIGITALSKILLX_FORWARD_SECRET`, and any currently configured storage/S3 variables (`STORAGE_PROVIDER`, `CONTABO_S3_ENDPOINT`, `CONTABO_S3_ACCESS_KEY`, `CONTABO_S3_SECRET_KEY`, bucket/region settings).
- Existing application options: preserve the current configured flags/values for certificates, auth, AI, email campaigns, course content factory, analytics and external payment products. Use the runtime variable names consumed in `process.env`/`runtimeEnv`; compare against the deployed environment without displaying values.

Never set `NODE_TLS_REJECT_UNAUTHORIZED=0`. Do not copy the old environment wholesale until each value is classified as public build-time or server runtime. `.env.production.example` intentionally contains only empty public keys and no credentials.

## Main branch checks and deployment

The repository workflow is `.github/workflows/production-release.yml`. It runs checks for pull requests targeting `main` and pushes to `main` or `codex/contabo-migration`; only a push event on exact ref `refs/heads/main` can deploy. It pins the tested GitHub commit into Coolify, turns off a competing provider auto-deploy trigger, queues deployment, checks the Coolify deployment record for the same commit, and verifies HTTPS health. It does not touch Vercel cron, database schema, Supabase, Paystack, storage, or email campaigns.

Before enabling the workflow:

1. Merge the reviewed migration branch changes into `main` only after the `verify` job passes. The currently running production app predates the migration branch's non-root Dockerfile and related hardening; confirm the Dockerfile in the proposed `main` merge before production rollout.
2. In GitHub repository Settings, add Actions variables `COOLIFY_API_BASE_URL=https://coolify.leadpilot.live/api/v1` and `COOLIFY_APP_UUID=ay1sfm49mfbzm1x1a6pil8tm`. Add secret `COOLIFY_API_TOKEN` from Coolify's API token screen. Grant only the smallest available read/update/deploy permissions for this application. Never put API tokens or deploy URLs in the repository.
3. Add a GitHub ruleset for `main` requiring pull requests and the `verify` status check, disabling force pushes and branch deletion. This keeps failing changes from being promoted to `main`. Confirm administrators do not bypass it unintentionally.
4. Confirm Coolify's current rollback-image retention includes the running known-good image; current configured retention is 2 images. Preserve the existing production app and image. Do not change app environment variables or run a manual deployment during setup.
5. After the workflow is merged and the secret is configured, use a reviewed deployment-related commit to `main` as the first automated release. Confirm GitHub reports the exact release SHA, Coolify history records that SHA and the deployment finishes, Coolify health is healthy, and the public HTTPS health endpoint verifies. Only then treat the pipeline as active. A manual production deployment is not required to test webhook delivery; the production push itself is the explicitly authorized deploy action.
6. If the deployment fails, Coolify's configured health check should keep an unhealthy replacement from replacing a healthy running container when rolling updates are supported. Verify this behavior from the installed Coolify version before relying on it. Use Configuration > Rollback to deploy the retained previous image if needed; then verify its SHA, health and critical user journeys. A container/image rollback does not reverse database changes.

The workflow API behavior has not yet been executed. It requires the above repository variables/secret and a successful run on `main`; no webhook, auto-deploy or exact-commit release is claimed as configured until then.

## Build and deploy to staging

1. Confirm the repository is `Bamson-dev/digitalskillx`, branch `codex/contabo-migration`, and review the exact commit/image digest and working tree. Build only reviewed committed files. Use Node 22 and npm 10.9.2 (`.nvmrc`, `package.json`, `package-lock.json`).
2. In Coolify, create a staging application using the repository and migration branch. Choose Dockerfile build; set context `/`, Dockerfile `Dockerfile`, service/container port `3000`, and expose it only to the Coolify proxy. Set a distinct staging hostname and valid HTTPS certificate.
3. Set staging `NEXT_PUBLIC_*` build args and staging runtime configuration. Use a staging Supabase project if available. If no isolated Supabase exists, do not run mutating integration/auth/payment/cron tests against production data; stop before enabling those functions.
4. Set `DIGITALSKILLX_DEPLOYMENT_ENV=staging`, `CRON_WORKER_ORIGIN` to the staging HTTPS origin, and generate a staging-only `CRON_SECRET`. Production canonical/Vercel worker origins are refused unless the deployment environment explicitly says `production`. Ensure staging Paystack is test mode, email goes only to an allowlisted controlled test inbox/provider sandbox, and production campaign/marketing jobs are disabled or use empty staging queues. Do not clone production secrets into staging.
5. Build and deploy the image. Check Coolify health and reverse-proxy logs without revealing environment values. Verify TLS externally and `GET https://<staging-host>/api/health` returns healthy. Verify container runs as non-root and port 3000 is not directly internet-accessible.
6. Run staging checks using test accounts: valid and invalid login; email normalization; session cookie persistence across refresh/navigation; logout; password reset to a controlled inbox; redirect allowlist; owned and unowned course access; admin authorization; course/certificate reconciliation error isolation. Browser evidence must confirm the cookie and destination, not just password success.
7. Exercise Paystack test-mode webhook signature, transaction verification and duplicate delivery; verify no duplicate transaction/enrollment/email. Test Leadthur handoff only with controlled fixtures. Test Supabase Storage upload/download against staging and confirm existing production object URLs are unchanged. Test controlled email delivery only.
8. Before applying schema, take a staging-only database backup/export and verify it is restorable. Check the `0032` prerequisites in the staging SQL editor (both the delivery table and enum value must exist):

   ```sql
   select
     to_regclass('public.program_course_publish_deliveries') is not null as migration_0032_delivery_table_ready,
     to_regclass('public.courses') is not null as courses_table_ready,
     to_regclass('public.profiles') is not null as profiles_table_ready,
     exists (
       select 1
       from pg_type t
       join pg_enum e on e.enumtypid = t.oid
       where t.typnamespace = 'public'::regnamespace
         and t.typname = 'notification_type'
         and e.enumlabel = 'program_course_added'
     ) as migration_0032_notification_type_ready;
   ```

   Continue only if all four values are `true`. Then apply `supabase/migrations/0054_course_publish_email_outbox.sql` to isolated staging only. Restart the staging container with a safe course-publish email pending; verify the existing scheduled `/api/cron/email-outbox` drain reclaims stale claims and sends the message once. Force a controlled provider failure and confirm retry/backoff. Verify other database-backed outbox/campaign/bulk/webinar jobs and logs. Never apply this migration to production as part of staging verification. Confirm app data does not depend on container writable storage; mount a volume only if a verified feature actually needs it.
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

## Production traffic and rollback

The current apex and `www` DNS already resolve to Contabo. Do not change DNS or remove Vercel while configuring automatic releases. Before changing production traffic in any later migration step, keep the prior host/image available and test the rollback procedure.

1. Freeze release inputs: reviewed `main` commit and immutable deployment record; save the prior Vercel deployment identifier/image and current Coolify config snapshot.
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

## Release gate follow-up — 2026-10-09

The latest read-only audit confirms that the automatic production release is **not yet enabled**. GitHub has no repository Actions secrets or variables and no repository webhook. The Coolify DigitalSkillX app still has native Auto Deploy enabled. Do not disable that setting until the replacement workflow has working credentials and its exact-commit deployment path has passed verification. The expected GitHub values are `COOLIFY_API_BASE_URL` (HTTPS API base) and `COOLIFY_APP_UUID` for `digitalskillx:main`; `COOLIFY_API_TOKEN` belongs in Actions secrets with only the minimum read/update/deploy scope. Never copy token values into this document or source.

The current workflow runs the release checks and then makes its `verify` job fail if any collected test/image step fails. An earlier GitHub run successfully built the Docker image but failed the broad suite on the Learn page and was correctly prevented from deploying. The Learn library integration is now isolated in commit `d8ecc9cb63c7994779d189d7ec800fec6f1348f3`; local Node 22/npm 10.9.2 checks pass, but remote Actions and Docker build must be observed for the updated commit. The full local unit suite depends on a sibling `/tmp/LeadRush` checkout; it is not reproducible in GitHub's clean checkout as currently configured. Fix that dependency before merging.

Production currently runs as root and lacks a verified persistent mount. The application defaults storage to `/app/.data/storage`; that directory did not exist in the live container and storage backend variables were absent. Do not configure a volume until the complete production data locations and backup are verified. `/api/health` is liveness, not DB readiness; add/configure a database-aware readiness check before using health as the sole promotion gate. The deployed app commit and basic live health remain recorded in `CONTABO-MIGRATION-STATUS.md`.

Vercel and Coolify currently invoke overlapping schedules. Keep both configurations unchanged until one owner per route has been selected and the exact invocation/cadence and idempotency have been verified. The route mapping is in `CONTABO-MIGRATION-STATUS.md`.
