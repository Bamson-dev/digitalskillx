# Contabo migration status

Updated: 2026-10-09

## State

- Working branch: `codex/contabo-migration` (created from `main` at `b99da43732749fa9a665644a710c72404b3b75fa`).
- Base commit: `b99da43732749fa9a665644a710c72404b3b75fa`. Reviewed migration code/config/docs and minimal strict-type fixes are committed on `codex/contabo-migration`. No production, DNS, VPS, Coolify, or database changes were made.
- Existing dirty and untracked learning/analytics work was present before implementation and has been left in place. Some TypeScript/type integration changes in the same areas are interleaved with that work; do not stage those paths without reviewing them as user WIP.
- No active Docker daemon or authenticated Contabo/Coolify/DNS access is available in this session. The live production host and authoritative Supabase project therefore remain unconfirmed. Repository files mention both Vercel and a Supabase host on Contabo; those are not proof of current topology.

## Confirmed from repository

- Next.js 14 App Router, React 18, TypeScript, npm; Node 22 is now declared in `.nvmrc`, package engines and Docker base image. npm is pinned to 10.9.2 in package metadata. The interactive workspace itself is Node 26/npm 11, so it is not the pinned validation runtime.
- The application has App Router pages, route handlers, server actions, Middleware and Supabase SSR auth/cookies. It uses Supabase Auth/Postgres/RLS, Paystack webhook and transaction verification, Leadthur handoff, Resend/ZeptoMail, Supabase Storage and a configurable local/S3 storage adapter.
- The public learning/course asset paths and existing Supabase object URLs must remain unchanged. The local storage adapter defaults to `.data/storage`; it is not durable in a container unless explicitly mounted. Keep the existing Supabase Storage provider unless a separately verified object migration is approved.
- `vercel.json` contains 22 cron entries: inactivity `0 9 * * *`; bulk import `15 9 * * *`; email outbox `45 9 * * *`; campaigns `55 9 * * *`; webinar follow-up at `5 8`, `25 10`, `5 11`, `5 13`, `5 15`, `5 17`, `0 14`, `0 18`, `0 20`, `30 21`, and `0 22` UTC daily; checkout abandonment `20 10 * * *`; content factory at `5 10`, `35 12`, `5 15`, `5 18`, and `5 21` UTC daily; Paystack external backfill `*/15 * * * *`.
- Routes for health, auth callback/session, `/api/sb`, Paystack webhooks, and cron handlers are present. The build output enumerates routes; Next self-hosting supports server rendering, route handlers, cookies, middleware and server actions in a Node server.
- Route inventory: 90 `app/api` handlers (51 admin, 10 cron, 6 auth, plus student, learn, payments, enroll, Supabase proxy, webhooks, assets/downloads, analytics and health groups) and 21 files with server actions. Auth is Supabase SSR in server, route-handler and middleware clients; cookie options are centralized in `lib/supabase/url.ts`. `/api/sb/[...path]` proxies Supabase through the app origin. Paystack uses `x-paystack-signature`, live transaction verification/fallback and transaction-reference idempotency before fulfillment; `/api/payments/confirm` handles redirect fallback. Preserve all paths, methods and headers.
- Upload/storage audit: storage adapters support local, filesystem and S3-compatible storage; asset routes include `/api/landing-assets`, `/api/sales-page-assets` and `/api/resources/[id]/download`. Compose persists the local adapter directory in the named `digitalskillx-storage` volume; the volume must be backed up off-host. Existing Supabase Storage objects and URLs remain untouched.
- Environment-name audit only (values are never recorded): client/build values `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`, `NEXT_PUBLIC_SENTRY_DSN`; server/auth/security `SUPABASE_SERVICE_ROLE_KEY` (plus legacy aliases `SUPABASE_SERVICE_KEY`, `SERVICE_ROLE_KEY`), `ADMIN_API_KEY`, `ADMIN_EMAIL`, `ADMIN_MFA_REQUIRED`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_SYNC`, `CRON_SECRET`, `CRON_WORKER_ORIGIN`, `DIGITALSKILLX_FORWARD_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET`; payments `PAYSTACK_SECRET_KEY`, `PAYSTACK_USD_ENABLED`, `PAYSTACK_AIAPP_COURSE_ID`; email `EMAIL_PROVIDER`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`, `ZEPTOMAIL_SMTP_HOST`, `ZEPTOMAIL_SMTP_PORT`, `ZEPTOMAIL_SMTP_USER`, `ZEPTOMAIL_SMTP_PASSWORD`, `ZEPTOMAIL_FROM_EMAIL`, `ZEPTOMAIL_FROM_NAME`, `EMAIL_CAMPAIGN_TEST_ADDRESSES`; AI/content `YOUTUBE_API_KEY`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`, all `CONTENT_FACTORY_*` and `CONTENT_AUTHORITY_*` limits/flags, `ENROLLMENT_LINKS_ENABLED`, `SALES_PAGE_IMPORT_ENABLED`; storage `STORAGE_PROVIDER`, `STORAGE_LOCAL_ROOT`, `CONTABO_STORAGE_ROOT`, `STORAGE_FS_ROOT`, `CONTABO_S3_ENDPOINT`, `CONTABO_S3_ACCESS_KEY`, `CONTABO_S3_SECRET_KEY`, `CONTABO_S3_BUCKET`, `CONTABO_S3_REGION`, `CONTABO_S3_PUBLIC_BASE_URL`, and corresponding `STORAGE_S3_*` aliases / `STORAGE_PUBLIC_BASE_URL`; analytics/tracking `STAPE_SERVER_URL`, `META_PIXEL_ID`, `META_CAPI_TOKEN`, `GOOGLE_SEARCH_CONSOLE_CONNECTED`, `GOOGLE_SEARCH_CONSOLE_SITE_URL`; runtime/build/platform `NODE_ENV`, `DIGITALSKILLX_RUNTIME_ENV_FILE`, `SENTRY_AUTH_TOKEN`, `SENTRY_ENVIRONMENT`, `SENTRY_ORG`, `SENTRY_PROJECT`, `COOLIFY_RESOURCE_UUID`, `VERCEL`, `INACTIVITY_DAYS`, `WEBINAR_FOLLOWUP_TEST_EMAILS`. Some values are optional or read dynamically from the platform settings/secrets tables. Compare names against the existing deployment securely before rollout; do not copy credentials into this report.
- `waitUntil` and `@vercel/functions` were removed. Background kicks now run in-process. Bulk import, email campaigns/outbox, and webinar follow-up have persisted job/recipient state and scheduled recovery paths, but restart recovery has not been exercised on staging. Course-publish notifications are a known exception: emails are sent before delivery IDs are written, with no durable outbox, so a restart can lose work and a retry can duplicate an email. That path must gain durable per-recipient queue/idempotency or be proven safe before production cutover. There is no separate durable worker process.

## Work completed locally

- Removed Docker-only lint and TypeScript build bypasses.
- Added a multi-stage Node 22 image, non-root runtime, healthcheck, public-only build args, private-network-only service exposure through Compose, and a named volume at `/app/.data/storage` for the existing local storage adapter. Actual runtime secrets are supplied to the container at runtime.
- Excluded `.env*`, `.vercel`, Git metadata, local DB files, keys, local data, and test output from Docker context; added a values-free production env template.
- Limited the runtime secret bootstrap file to `/tmp/digitalskillx-runtime-env.json` with mode `0600`; removed API-key prefix logging and added child-process signal forwarding. TLS verification in the Supabase fetch bridge is now always enabled.
- Made worker continuation origins deployment-specific using `CRON_WORKER_ORIGIN` / `NEXT_PUBLIC_SITE_URL` and changed email-campaign continuation to use the active site's URL.
- Corrected discovery query/type integration with the learning/analytics WIP so the current working tree typechecks.

## Validation results

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed on local Node 26 with warnings (Sentry/OpenTelemetry dynamic require, Supabase Edge-runtime import warning, and expected dynamic-cookie prerender diagnostics). Must repeat in Node 22/Docker.
- Clean staged-tree typecheck and production build both passed in isolated temporary checkouts, without the unrelated untracked learning/analytics WIP; this confirms the migration branch snapshot builds independently. These checks still ran under local Node 26/npm 11, not the pinned Node 22/npm 10 toolchain.
- Learn discovery (29 checks), Learn analytics (19), Paystack external enrollment (36), Leadthur handoff (30), and platform hardening offline (10/10): passed.
- `npm run test:unit`: fails in the existing content-factory certification at `scripts/certification/test-content-factory.mjs:2315`; it asserts the cron route must contain literal `p_limit: 1`, while the route calculates a bounded `factoryJobLimit`. This is an existing concurrency/capacity assertion mismatch and was not changed without business review. The stale Phase 8 email assertion was updated to match the existing Resend-primary/ZeptoMail-fallback implementation; that standalone test passes.
- AI Money Code campaign continuation test passes after replacing its Vercel-only `waitUntil` assumption with the Node background-task path; the 22 cron schedules remain unchanged.
- `npm run test:security-scan`: failed because it scanned pre-existing untracked `tmp/cloud-migrate/platform_secrets.json`. Its contents were not inspected or printed. Preserve that user file; it is excluded from Docker context. Re-run in a clean/safe test environment or update scan scope without altering the artifact.
- `npm run check-env`: reports the three expected Supabase variables missing from local environment; no values were printed. No live credentials were requested.
- Docker daemon unavailable; image build, container health, Coolify staging, domain TLS, live auth, webhook, storage and cron behavior are unverified.

## External blockers and next steps

1. Confirm the production app host, authoritative Supabase project, and whether Supabase Auth/Postgres/Storage already run on the VPS. Confirm VPS CPU/RAM/disk, Docker/Coolify status and backup target.
2. Resolve aggregate unit-test email contract and isolate the security scan from the local `tmp` artifact.
3. Run the Docker image under Node 22 on a staging hostname with staging Supabase, payment test-mode, email sink/provider and separate `CRON_SECRET`/`CRON_WORKER_ORIGIN`.
4. Add durable per-recipient queue/idempotency for course-publish emails and verify pending/failed/retry states; do not declare background parity before this and restart tests pass.
5. Configure the exact 22 cron entries in UTC once in Coolify/host cron only after staging proves authentication, no overlap duplication, retries and queue recovery. Disable Vercel schedules only during an approved cutover window.
6. Verify Supabase Auth redirect allowlists, cookie domain/HTTPS, Paystack webhook destination, storage, backup restoration and rollback on staging.
7. Obtain explicit approval before any production DNS, webhook target, credential, database schema, production deployment, or Vercel schedule change.

See [deployment runbook](CONTABO-DEPLOYMENT-RUNBOOK.md) and [rollback plan](CONTABO-ROLLBACK.md).
