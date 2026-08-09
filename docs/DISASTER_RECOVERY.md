# DigitalSkillX — Disaster Recovery

Phase 6 operational guide. This documents **what to do when dependencies fail**. It does not change production backup settings.

## Backup assessment (verify in Dashboard)

| Asset | Where | Verified in repo? |
|-------|--------|-------------------|
| Postgres (Supabase) | Supabase plan backups / PITR | **No** — see `docs/SUPABASE_BACKUPS.md`. Confirm plan in Dashboard. |
| Contabo Object Storage | Contabo bucket versioning / off-site copy | **Not configured in this repository** |
| Supabase Storage | Included with project backups (plan-dependent) | **Not verified here** |
| Vercel deployments | Instant Rollback in Vercel | Platform feature — not in repo |

**Do not assume backups exist** until confirmed for the live project.

---

## Failure playbooks

### Database failure (Supabase outage / Postgres unreachable)

| Question | Answer |
|----------|--------|
| What failed? | Reads/writes to Postgres, Auth session validation if Auth is down |
| What remains? | Static marketing shells may still render; payments/enrollment/admin stop |
| Rollback? | Not a code rollback — wait for Supabase or restore from backup/PITR |
| Restore? | Supabase Dashboard → Backups / PITR. Validate with `/api/health` + admin System health |

### Storage failure (Supabase Storage)

| Question | Answer |
|----------|--------|
| What failed? | Course resources / legacy uploads via Supabase Storage |
| What remains? | Sales Page Contabo assets (if Contabo healthy); DB; classroom YouTube |
| Rollback? | N/A for provider outage |
| Restore? | From Supabase backup if objects were lost; do **not** migrate Contabo ↔ Supabase without authorization |

### Contabo failure

| Question | Answer |
|----------|--------|
| What failed? | Sales Page asset upload/serve |
| What remains? | LMS data, payments, enrollments, YouTube lessons |
| Rollback? | Pause Sales Page asset publishes; keep drafts local |
| Restore? | Re-upload assets after Contabo recovers; check Contabo bucket integrity externally |

### Vercel deployment failure / bad deploy

| Question | Answer |
|----------|--------|
| What failed? | App responses / build |
| What remains? | Database and storage untouched |
| Rollback? | Vercel → Deployments → Promote previous production deployment |
| Restore? | Redeploy known-good commit; do not apply speculative migrations during incident |

### Email provider failure (ZeptoMail / SMTP)

| Question | Answer |
|----------|--------|
| What failed? | Outbound mail (welcome, receipts, idle reminders) |
| What remains? | In-app notifications; enrollments; payments |
| Rollback? | N/A |
| Restore? | Outbox drain retries pending rows after SMTP recovers; check `bulk_import_email_outbox` |

### Payment provider failure (Paystack)

| Question | Answer |
|----------|--------|
| What failed? | Initialize / verify / webhooks |
| What remains? | Existing enrollments; Enrollment Links; admin enroll |
| Rollback? | Pause checkout messaging; do not rewrite payment code mid-incident |
| Restore? | After Paystack recovers, run integrity cron with `?repair=1` only if authorized for missing enrollments |

### Broken migration

| Question | Answer |
|----------|--------|
| What failed? | Schema apply / app queries missing columns |
| What remains? | Prior schema if migration was additive and failed mid-way |
| Rollback? | Prefer **forward fix**. Additive Phase migrations (`0036+`) avoid destructive drops. Do not run unreviewed DOWN scripts on production |
| Restore? | Fix forward migration; re-apply companion `sql/apply-*.sql` in SQL Editor if needed |

### Failed background jobs

| Question | Answer |
|----------|--------|
| What failed? | Cron (inactivity, integrity, email drain), bulk import phases |
| What remains? | Interactive API paths |
| Rollback? | N/A |
| Restore? | Reclaim stuck outbox (`reclaim_stale_bulk_import_email_outbox`); retry failed import jobs from admin; inspect audit logs |

---

## Rollback process (application)

1. Identify last known-good git SHA / Vercel deployment.
2. Instant Rollback on Vercel (or redeploy that SHA).
3. Confirm `/api/health` public liveness and admin System health.
4. Do **not** reverse-apply DB migrations unless a tested rollback SQL exists and is authorized.

## Migration rollback considerations

- Phase migrations are **additive** (tables/indexes/functions).
- Dropping Phase tables in production is a data-loss event — require explicit authorization.
- Indexes from `0040_platform_reliability.sql` can be dropped safely if needed without data loss.
