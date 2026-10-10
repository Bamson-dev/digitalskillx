
## Update 2026-10-10 (verified)
- Commit 277248a (docs only) passed check verify on pull_request and push (runs 38005264707 and 38005261145). deploy-production was skipped, as intended off main. The combined status also lists a separate Vercel status. It comes from Vercel's Git integration, not from GitHub Actions, and it is not a required check.
- Later commits add the storage write guard (lib/storage/index.ts), tests for it and for the cron plan (both run inside test:platform-hardening), ops/coolify-cron-tasks.json and docs/CONTABO-RELEASE-PLAN.md. Run those tests locally: storage guard, cron plan and Phase 6 hardening all pass.
- Review of PR 1 beyond hosting: the course publish email outbox (migration 0054, notify-publish route, cron email-outbox) needs the schema check in CONTABO-RELEASE-PLAN.md before merge. lib/background-tasks.ts replaces Vercel waitUntil with fire and forget work, so durability depends on the outbox and cron drains. next.config.mjs no longer ignores TypeScript and ESLint errors in Docker builds, and the Docker build sets a 1536 MB Node heap, so a low-memory build host can fail. The @vercel/functions dependency is removed. package.json pins engines (node 22, npm 10).
- Storage, cron, migration and release-trigger plans: see docs/CONTABO-RELEASE-PLAN.md.
- Still open, owner actions: save the main ruleset (GitHub email verification), add COOLIFY_API_TOKEN, inventory and back up /app/.data/storage, run the read-only migration checks on production, confirm Vercel crons are off, then create the 14 Coolify tasks.
# Release readiness (2026-10-10)

Branch codex/contabo-migration, PR #1. Merge is blocked until the items below are closed.

## Verified
- PR head fbe8cdd: check "verify" passes on pull_request and push. deploy-production is skipped off main.
- Cross-repo tests read LEADRUSH_BACKEND_DIR. CI fetches Bamson-dev/LeadPilot at e681cf845875542a01717ce324f89407b62b3018. No repo named LeadRush exists. LeadPilot (packages leadthur, @leadthur/backend) is assumed to be the maintained Leadthur backend. Repository history does not prove this.
- Live https://digitalskillx.com/api/health returned status ok on 2026-10-09.

## Not saved or not done
- Ruleset for main: form filled (PR required, check "verify" from GitHub Actions, block force push, block deletion). GitHub asked for email identity verification, so it is NOT saved.
- Deploy trigger: Coolify source is Public GitHub, repo has no webhooks, no Actions secret COOLIFY_API_TOKEN. Variables COOLIFY_API_BASE_URL and COOLIFY_APP_UUID are set. The deploy job cannot run yet.

## Storage (data-loss risk)
Coolify has no persistent volume and no STORAGE_PROVIDER, S3 or filesystem root env var. getContaboIntegrationStatus() therefore reports configured=false and provider local (/app/.data/storage, inside the container).
- Course resources and lesson attachments check configured. When false they use Supabase bucket private-files. Not at risk.
- No configured check and no Supabase fallback, so these write and read local files that are lost on container replacement: admin sales-page assets (POST, DELETE), public sales-page-assets, landing-assets, lib/landing-import/run-import.ts, lib/content-factory/artwork.ts.
- The directory contents in production are not inspected. Do not mount a volume over /app/.data/storage until they are listed and backed up.
Plan: inventory, back up, then set STORAGE_PROVIDER=filesystem with CONTABO_STORAGE_ROOT on a named volume (or S3), copy the files in, verify one asset per route, redeploy, verify again after a second redeploy.

## Migrations
No supabase/config.toml, so no CLI ledger. Duplicate prefixes already exist: 0020, 0036, 0054. Do not rename.
- 0054_course_publish_email_outbox.sql: additive, create if not exists and create or replace function. Needs tables courses and profiles. Not on main.
- 0054_library_build_throughput.sql: additive alter table add column if not exists on library_build_settings. Already on main.
- Code that needs the outbox table and functions: app/api/admin/courses/[courseId]/notify-publish/route.ts, app/api/cron/email-outbox/route.ts, lib/course-publish-email-outbox.ts, lib/course-program-notify.ts.
Check on production before merge (read-only): select to_regclass('public.program_course_publish_email_outbox'); select proname from pg_proc where proname in ('claim_program_course_publish_email_outbox','reclaim_program_course_publish_email_outbox'); select column_name from information_schema.columns where table_name='library_build_settings' and column_name='continuous_expansion_enabled'. Apply the outbox file to staging first, then production after a backup.

## Scheduled jobs: Vercel (vercel.json) vs Coolify tasks
Same time on both: inactivity 0 9, bulk-import 15 9, email-outbox 45 9, email-campaigns 55 9, checkout-abandon 20 10, paystack-external-backfill every 15 minutes, webinar-follow-up 25 10, content-factory 5 10.
Vercel only (missing from Coolify, would be MISSED if Vercel crons are turned off): webinar-follow-up 5 8, 5 11, 5 13, 5 15, 5 17, 0 14, 0 18, 0 20, 30 21, 0 22; content-factory 35 12, 5 15, 5 18, 5 21.
Coolify only: contabo-supabase-pg-dump-reminder 15 3.
Mail sends carry an idempotencyKey. Duplicate-run behavior of each route is not verified. Whether Vercel crons still fire is unverified (no Vercel access).
Plan: add the 14 missing Coolify tasks, compare Coolify task execution output for one day, then remove vercel.json crons or disable them in Vercel.

## Rollback
See docs/CONTABO-ROLLBACK.md. Production runs commit 0ab7201 (deployed 2026-09-29). Keep it as the known-good release. Keep Vercel until the above is closed.
