# PR 1 review: changes beyond hosting (2026-10-10)

Diff base b99da43, head bba4ffe. 59 files. Findings that change production behavior, ordered by risk.

## 1. Worker origin needs two Coolify variables (action before merge)
lib/bulk-import-continue.ts resolveCronContinuationOrigin now throws when neither CRON_WORKER_ORIGIN nor NEXT_PUBLIC_SITE_URL is set. For digitalskillx.com, www.digitalskillx.com and *.vercel.app it also throws unless DIGITALSKILLX_DEPLOYMENT_ENV (or VERCEL_ENV) equals production. The call sits in scheduleBulkWorkerContinuation outside the background task, so the error reaches the cron route. email-outbox, bulk-import, email-campaigns, webinar-follow-up and content-factory routes return an error whenever they have more work and try to chain.
Coolify variable names seen on 2026-10-10 (names only, values were masked and not read): NODE_ENV, NEXT_PUBLIC_SITE_URL, CRON_SECRET, RESEND_API_KEY, NODE_TLS_REJECT_UNAUTHORIZED, DIGITALSKILLX_FORWARD_SECRET. Not present: DIGITALSKILLX_DEPLOYMENT_ENV, CRON_WORKER_ORIGIN.
Action: set DIGITALSKILLX_DEPLOYMENT_ENV=production and CRON_WORKER_ORIGIN=https://www.digitalskillx.com in Coolify before the merge deploy. keepWebinarFollowupSending and keepContentFactoryRunning now skip silently when no origin is set, so a missing variable also stops those chains without an error.

## 2. TLS verification is now always on (confirm before merge)
lib/supabase/fetch-bridge.ts no longer honors NODE_TLS_REJECT_UNAUTHORIZED=0. Coolify has a variable with that name. Its value is masked and was not read. If it is 0 because the Supabase endpoint presents a certificate that does not verify, database calls from the app fail after the deploy. Action: read the value in Coolify. If it is 0, confirm the Supabase endpoint certificate verifies from the container, then delete the variable. The runbook says never to set it to 0.

## 3. Resend failure no longer falls back to ZeptoMail for keyed mail
lib/email/index.ts returns the Resend result when params.idempotencyKey is set. Keyed mail is the course publish outbox, webinar follow-up and campaign tests. If Resend is down or unconfigured, those messages fail and the outbox retries Resend later with the same key. Unkeyed mail such as password reset still falls back. Resend is configured in Coolify (RESEND_API_KEY exists). Accepted trade: no duplicate sends after an ambiguous Resend response.

## 4. Background work no longer survives a process restart
lib/background-tasks.ts replaces Vercel waitUntil with a fire and forget promise. A deploy or restart drops tasks that are in flight. Durable work sits in database queues (email outbox, webinar follow-up rows, content factory jobs), and the cron routes drain them, so a lost chain step is recovered by the next scheduled run. This depends on the cron schedules being owned and running on Coolify, which is the open cron item.

## 5. Build is stricter and needs more attention
next.config.mjs removed ignoreDuringBuilds and ignoreBuildErrors for Docker builds. Type and lint errors now fail the build. CI passes with this, so the code is clean today. The Dockerfile keeps a 1536 MB Node heap. A low-memory build host can run out of memory. Watch the first Coolify build.

## 6. Smaller changes, no action
- scripts/start.mjs and runtime-env-preload.cjs write runtime configuration to one file in /tmp with mode 600, stop logging a YouTube key prefix and secret counts, and forward SIGTERM, SIGINT and SIGHUP to the child. Graceful shutdown is better. The old runtime-env.json paths are gone, so nothing may rely on them.
- lib/course-program-notify.ts moved publish mail into the durable outbox (migration 0054 required, see CONTABO-RELEASE-PLAN.md).
- lib/content-factory/worker-policy.ts holds the job claim limit that was inline (8, 6 or 4). Same values.
- @vercel/functions is removed from package.json and the lockfile. engines pin node 22 and npm 10. .nvmrc added.
- Error text that named Vercel now names the runtime environment.

## Pinned LeadPilot contract checks
CI fetches Bamson-dev/LeadPilot at e681cf845875542a01717ce324f89407b62b3018 into the runner temp directory and sets LEADRUSH_BACKEND_DIR. Reproduced locally: test:paystack-external (36 checks) and test:leadthur-handoff (30 checks) pass against the pin and fail with ENOENT for a wrong directory, so they cannot pass by skipping. They assert on source files. They do not prove the running Leadthur service uses that SHA, and the link between LeadPilot and the old LeadRush name is assumed.
