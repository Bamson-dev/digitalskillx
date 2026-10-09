# Contabo migration rollback plan

## Verified production state (2026-10-09)

- Apex and `www` DNS resolve to the Contabo Coolify server and public HTTPS health checks return 200. The DigitalSkillX Coolify app is running healthy on commit `0ab7201dd8377ee701c172de10c1e984f0c2e702`; its latest successful deployment in history was a manual run on 2026-09-29.
- Vercel still has a production deployment/domain attached and its Cron setting lists 22 enabled invocations. Coolify lists 8 DigitalSkillX scheduled tasks with overlapping routes. Their exact commands, cadence parity and actual invocations are unverified; DNS points to Contabo, but scheduler ownership is unresolved.
- Automatic GitHub deployment has not been verified: Coolify's Auto Deploy option is on, but there is no GitHub repository webhook and the latest deployment was manual. The production release workflow is staged on `codex/contabo-migration` and has not run.
- No production resources or schedules were changed in this turn. The current Coolify rollback retention is set to 2 images, but the rollback image list was still loading in the dashboard; availability of a known-good rollback image is not yet verified.
- No isolated staging environment was verified. The Coolify app labelled `digitalskillx:staging` reports unknown health and appears under an environment labelled `production`.

For staging rollback, first verify the environment truly uses isolated Supabase, email, Paystack and storage. Preserve its database/outbox and storage, then redeploy its prior image. Do not drop `program_course_publish_email_outbox` or delete pending rows until diagnosed. Production rollback must never restore production data as part of an application image rollback.

The user has explicitly authorized direct production deployment as the intended workflow. Rollback must not remove data, volumes, backups or the previous Vercel deployment. Scheduler and traffic changes should be coordinated to retain one active owner and a usable fallback.

## Rollback triggers

- App health/TLS failure that persists through the agreed recovery window.
- Students cannot maintain Supabase sessions or authorized course access.
- Payment webhook verification/fulfillment is failing or duplicates are observed.
- Existing storage assets/uploads are missing or inaccessible.
- Cron overlap, duplicate email/payment/entitlement processing, stalled durable queues, or secret leakage is detected.
- VPS saturation or disk pressure threatens the app or existing Supabase services.

## Before cutover

Record the current authoritative Supabase project, DNS records and TTL, Paystack webhook target, Vercel deployment ID, scheduler owner and cron configuration. Save the tested Coolify image/commit and previous known-good image/deployment ID. Confirm the previous image appears under Coolify Configuration > Rollback and that the API health check is enabled. Verify database/Auth/Storage recovery artifacts in an isolated environment. Keep the previous host, secrets, database and storage intact.

## Revert application traffic

1. Stop VPS cron invocations first and record their last run. Confirm no job is in progress or hold any data migration until safe. Do not run the same scheduler on both hosts.
2. Restore the previous production app deployment/known-good image on the original host. If DNS already moved, restore the saved apex and `www` records and prior TTL values. Do not guess DNS target values; use the saved pre-cutover records.
3. Restore the original Supabase Auth Site URL and redirect allowlist only if those were changed, preserving existing approved callback URLs. Restore the Paystack webhook target only if changed and only after confirming which host is receiving events.
4. Enable the original scheduler only after VPS jobs are stopped and inspect queue/outbox/campaign state to avoid duplicate sends. Check Paystack transaction references and enrollment idempotency before replaying any failed webhooks.
5. Keep Supabase database/Auth/Storage unchanged. A host rollback does not justify restoring or replacing the database. Restore a database/storage backup only if a separately verified data corruption event requires it and explicit approval has been granted.
6. Validate health, TLS, login/session refresh/logout, password reset with controlled address, course ownership, admin access, webhook verification using test mode, storage URLs and a single harmless cron request.
7. Preserve VPS logs and deployment artifacts for diagnosis without copying secret values. Keep both hosts available until the incident is resolved.

## Recovery data and safety

- Database and Supabase Auth: provider-managed point-in-time/backup or supported export, with restore proven in an isolated project.
- Storage: inventory and backup of existing object keys/metadata; preserve provider and public URLs.
- Runtime config: restore from secure secret manager, never from repository or logs.
- No production schema rollback is planned for this host migration. Additive learning migrations `0052` and `0053` are present in the current working tree but untracked; do not apply them to production as part of hosting cutover. Review and deploy schema changes separately after approval.
- Do not delete Docker volumes, database data, storage buckets, old deployments, or backup snapshots during recovery.

## Post-rollback checks

Track app availability, authentication/session refresh, course-access denials, webhook deliveries and idempotency, outbox/campaign retry state, storage 404s, cron ownership, CPU/RAM/disk and backup age. Notify affected students only after measuring scope and obtaining separate authorization; do not launch a bulk recovery email from this runbook.
