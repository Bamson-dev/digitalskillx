# Contabo release plan: cron, migrations, release trigger (2026-10-10)

Companion to CONTABO-RELEASE-READINESS.md. Nothing here was applied to production.

## Cron schedules

File ops/coolify-cron-tasks.json lists all 22 vercel.json runs. 8 exist in Coolify. 14 are missing: 10 webinar-follow-up and 4 content-factory. Test scripts/certification/test-coolify-cron-plan.mjs fails if vercel.json and the plan drift apart.

Rules:
- Do not create the 14 tasks while Vercel still fires the same routes. Two owners would run each job twice.
- Check whether Vercel crons still fire: Vercel dashboard, Cron Jobs tab, last invocation time. No Vercel access exists in this session, so this is open.
- When Vercel is off (cron jobs disabled or project removed), create the 14 tasks in Coolify with the command template from the plan file and CRON_SECRET from the app environment. Never paste the secret into the task command.
- Idempotency: mail sends carry an idempotencyKey, and the outbox drains claim rows. The webinar-follow-up and content-factory routes were not proven safe for double runs, so keep one owner.
- After the switch, compare one day of Coolify task executions against the vercel.json list, then delete the crons block from vercel.json.

## Migrations 0054

Two files share prefix 0054. Migrations are applied by hand, so the prefix is a label and the clash does not stop either file from running. Do not rename them, because a rename breaks any record of what ran.

- 0054_library_build_throughput.sql: add column if not exists on library_build_settings. On main, so production likely has it.
- 0054_course_publish_email_outbox.sql: create table if not exists, indexes, create or replace function. Not on main. Needed by notify-publish, cron/email-outbox, lib/course-publish-email-outbox.ts and lib/course-program-notify.ts.

Procedure, read-only first:
1. In the Supabase SQL editor run: select to_regclass('public.program_course_publish_email_outbox'); select proname from pg_proc where proname in ('claim_program_course_publish_email_outbox','reclaim_program_course_publish_email_outbox'); select column_name from information_schema.columns where table_name = 'library_build_settings' and column_name = 'continuous_expansion_enabled'.
2. If the table and both functions exist, nothing to apply. Record the result in the PR.
3. If missing, take a database backup, run the outbox file on a staging database, check the outbox route, then run it on production before the merge deploys. Both files are idempotent, so a repeat run is safe.
4. If the library column is missing, run the library file the same way.
5. Merge only after step 2 or 3 confirms the outbox objects exist. Without them the cron and publish routes error.

## Release trigger

Options:
- Coolify Git webhook: fires on push to main with no CI wait. A failing commit would deploy. Rejected unless main allows merges only after the verify check passes.
- GitHub Actions deploy job (current): production-release.yml job deploy-production needs verify, runs only on push to main, and pins the commit SHA through the Coolify API with auto deploy off. It needs the repository secret COOLIFY_API_TOKEN, which only the owner can enter.

Decision: use the Actions deploy job as the single release path. Leave the Coolify webhook and auto deploy off, so no second path can deploy an unverified commit. Required to finish, all owner actions:
1. Save the ruleset on main: pull request required, required check named verify from GitHub Actions. GitHub needs email verification first.
2. Create a Coolify API token with deploy and write scope, store it as the secret COOLIFY_API_TOKEN.
3. Merge PR 1, then confirm the deploy job ran, Coolify runs the merged SHA, and /api/health returns ok.
Vercel's Git integration is still attached and reports a failing Vercel status. Disconnect it only after step 3 passes.

## Storage write guard

lib/storage/index.ts now blocks upload, replace, copy and move on the local adapter in production when STORAGE_LOCAL_ROOT is unset. Reads, exists and delete still work. Impact until persistent storage exists: admin sales-page asset upload, landing import and content-factory artwork writes return an error instead of saving to a disk that disappears on redeploy. Fix: configure S3 or a mounted volume (after inventory and backup), or set STORAGE_ALLOW_EPHEMERAL=1 to accept data loss. Test: scripts/certification/test-storage-ephemeral-guard.mjs, part of test:platform-hardening.
## Update 2026-10-10 evening

Release trigger step 1 is done: ruleset 24832751 on main requires a pull request and the verify check from GitHub Actions, and blocks force push and deletion. Steps 2 and 3 remain.

## TLS cutover (blocks the release)

The branch enforces certificate verification for the Supabase bridge. Production today sets NODE_TLS_REJECT_UNAUTHORIZED=0, and the Supabase hostname in SUPABASE_URL has no public DNS record, so Traefik cannot present a trusted certificate for it. Order of work:
1. Owner, DNS: add a DNS-only A record for the Supabase hostname pointing at the VPS. No AAAA unless IPv6 works end to end.
2. Confirm Traefik issued a Let's Encrypt certificate for that exact hostname (Coolify proxy logs, or a browser visit to the hostname).
3. From inside the app container: openssl s_client -connect coolify-proxy:443 -servername <supabase host> -verify_hostname <supabase host> -verify_return_error </dev/null must end with Verify return code: 0 (ok).
4. From inside the app container, with NODE_TLS_REJECT_UNAUTHORIZED unset for that one command: a Node probe using the same lookup and servername as lib/supabase/fetch-bridge.ts and rejectUnauthorized: true must complete the handshake, then one read-only query through the server Supabase client must succeed.
5. Delete NODE_TLS_REJECT_UNAUTHORIZED in Coolify, deploy the release, and check logs for SELF_SIGNED_CERT_IN_CHAIN, UNABLE_TO_VERIFY_LEAF_SIGNATURE and ERR_TLS_CERT_ALTNAME_INVALID. Then test login, a course page, a Paystack verification and one email send.
Do not deploy this branch before step 4 passes. Calling Kong over plain HTTP on the Docker network was rejected because it removes TLS for service-role traffic. A private CA (pinned per Agent, rejectUnauthorized kept true) is the fallback if the hostname must stay private.
