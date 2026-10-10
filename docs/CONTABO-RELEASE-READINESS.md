# Release readiness (2026-10-10, evening)

Branch codex/contabo-migration, PR #1. Do not merge or deploy. Release blockers are listed first.

## Release blockers
1. Supabase TLS. Coolify sets NODE_TLS_REJECT_UNAUTHORIZED=0 for digitalskillx:main. SUPABASE_URL and SUPABASE_UPSTREAM_URL use a hostname with no public DNS record (Google DNS returns NXDOMAIN on 2026-10-10). Traefik therefore cannot hold a publicly trusted certificate for it, and production works only because verification is off. The branch now forces rejectUnauthorized: true in lib/supabase/fetch-bridge.ts. Deploying the branch before the certificate is fixed would break every server-side Supabase call. Fix (owner, DNS): add a DNS-only A record for the Supabase hostname to the VPS, let Traefik issue a Let's Encrypt certificate, then run the checks in CONTABO-RELEASE-PLAN.md under "TLS cutover". Keep the env override until those checks pass, then delete it.
2. Storage. digitalskillx:main has no persistent storage in Coolify ("No storage found"). The running container started 2026-09-29 18:26 UTC, so any local files (sales-page assets, landing import assets, content factory artwork) were written after that and exist only inside that container. A deploy deletes them. Inventory and back up first (CONTABO-STORAGE-MIGRATION.md). The container terminal is not available to the agent.
3. Outbox schema. Migration 0054_course_publish_email_outbox.sql must exist in production before deploy. No database access is available to the agent, and the public anon key is not exposed in the site bundle, so existence was not checked. Run the read-only queries in CONTABO-RELEASE-PLAN.md.
4. Deploy token. Repository has no Actions secrets. The deploy job needs COOLIFY_API_TOKEN (owner creates it in Coolify, Keys and Tokens, and stores it in GitHub secrets).

## Verified on 2026-10-10
- Branch head 70495f2 (code). CI verify passed on push run 56 (id 38071532831) and pull_request run 57 (id 38071537289). Every step succeeded: typecheck, lint, content factory, outbox, security scan, platform hardening, Paystack external, Leadthur handoff, Docker image build, unit suite. deploy-production skipped (not main).
- Local runs on 70495f2: typecheck, lint, platform hardening (Phase 6 10/10, storage guard, cron plan, Supabase TLS), unit suite with the pinned LeadPilot checkout, content factory suite. All pass.
- TLS regression test (scripts/certification/test-supabase-tls.mjs): scans lib, app and start scripts for disabled verification, asserts the bridge config is literally rejectUnauthorized: true even with NODE_TLS_REJECT_UNAUTHORIZED=0, and makes a real HTTPS request through the bridge to a local self-signed server, which must fail with a certificate error. The test fails against the previous code.
- Storage guard regression test: seeds a real file, then checks replace, upload, copy and move are blocked with the original intact, reads and delete work, opt-outs allow writes, assertWritable throws when blocked, and content factory artwork makes zero image API calls when storage is blocked (before this fix each run paid for up to 3 image generations and then failed to store them).
- Ruleset 24832751 on main is active: pull request required, required check verify from GitHub Actions (strict), force push and deletion blocked.
- Coolify variables saved on digitalskillx:main (runtime only): DIGITALSKILLX_DEPLOYMENT_ENV=production, CRON_WORKER_ORIGIN=https://www.digitalskillx.com. They take effect on the next deploy or restart. The running main code does not read them. Coolify shows 2 unapplied configuration changes because of them. No redeploy was triggered.
- Live https://digitalskillx.com/api/health returned status ok at 2026-10-10 17:24 UTC. This does not prove database connectivity.
- Production runs 0ab7201 (deployed 2026-09-29 18:26 UTC). main is at b99da43, which is not deployed.

## Not verified
- Whether Vercel crons still fire (no Vercel access). The 14 missing Coolify runs stay uncreated (ops/coolify-cron-tasks.json).
- Pinned LeadPilot SHA vs the deployed Leadthur service.

## Rollback
Coolify Rollback tab on digitalskillx:main redeploys a previous image. Known good: 0ab7201. Keep Vercel attached until a Contabo release passes the checks above. See CONTABO-ROLLBACK.md.

## Earlier history
277248a, 67146bd, 0a418b7, bba4ffe, 8d64ae1 all passed verify. The replace-before-delete storage bug was fixed in 0a418b7.
