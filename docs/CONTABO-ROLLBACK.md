# Contabo migration rollback plan

## Current staging verification state (2026-10-09)

- GitHub `origin/codex/contabo-migration` was verified at `9aaf86dec54dce24504723a35bd7120df5d41d6b`.
- No Coolify credentials/configuration, Node 22 runtime, or active Docker daemon is available in this environment. No staging deployment URL exists and no staging database migration has been applied.
- No production resource was changed. The procedures below remain future operator steps, not evidence that staging or production is live.

For a future staging rollback, stop staging-only cron invocations, preserve the staging database/outbox and storage volume, then redeploy the prior staging image. Do not drop `program_course_publish_email_outbox` or delete pending rows until the staging issue is diagnosed; this migration has not been applied here. Production rollback instructions below apply only after a separately approved production cutover.

Rollback is an operator action requiring explicit approval when it changes production DNS, scheduler ownership, webhook destinations or traffic. Do not delete data or volumes during rollback.

## Rollback triggers

- App health/TLS failure that persists through the agreed recovery window.
- Students cannot maintain Supabase sessions or authorized course access.
- Payment webhook verification/fulfillment is failing or duplicates are observed.
- Existing storage assets/uploads are missing or inaccessible.
- Cron overlap, duplicate email/payment/entitlement processing, stalled durable queues, or secret leakage is detected.
- VPS saturation or disk pressure threatens the app or existing Supabase services.

## Before cutover

Record the current authoritative application host, Supabase project, DNS records and TTL, webhook target, Vercel deployment ID, scheduler owner and cron configuration. Save the tested Contabo image digest and previous known-good image/deployment ID. Verify database/Auth/Storage recovery artifacts in an isolated environment. Keep the previous host, secrets, database and storage intact.

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
