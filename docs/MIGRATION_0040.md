# Migration 0040 — Platform reliability (apply report)

**Status:** Written in repo. **Not applied to production** (requires explicit authorization).

## Files

- `supabase/migrations/0040_platform_reliability.sql`
- `sql/apply-platform-reliability.sql` (manual SQL Editor companion; identical content)

## What it changes

| Kind | Detail |
|------|--------|
| Tables affected | `product_events` (index only), `enrollments` (index only), `bulk_import_email_outbox` (rows may be updated by reclaim function when invoked) |
| Indexes created | `product_events_student_created_idx` (partial, `student_id IS NOT NULL`); `enrollments_idle_reminder_pending_idx` (partial, incomplete + no idle reminder) |
| Functions created | `reclaim_stale_bulk_import_email_outbox(integer)` — security definer, `service_role` execute only |
| Policies affected | **None** |
| Data changes on apply | **None** — indexes/functions only. Reclaim updates happen only when the function is later called by the outbox drain worker |
| Destructive DDL | **None** (no DROP TABLE, no column drops, no RLS policy changes) |

## Safety

**Safe to apply** as an additive migration:

- `CREATE INDEX IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION`
- Idempotent / re-runnable
- Does not rewrite application data during apply
- Grant is limited to `service_role`

## Rollback considerations

```sql
drop index if exists public.product_events_student_created_idx;
drop index if exists public.enrollments_idle_reminder_pending_idx;
drop function if exists public.reclaim_stale_bulk_import_email_outbox(integer);
```

Dropping indexes/functions does not delete business data. Without the reclaim function, drain still falls back to a direct `sending`→`pending` update in application code when RPC is missing.

## How to apply (requires your authorization)

Do **not** auto-apply from this agent.

Approved options once you authorize:

1. **Supabase SQL Editor** — paste/run `sql/apply-platform-reliability.sql`
2. **CLI** (if linked to the project): `supabase db push` (applies pending migrations in order), or  
   `psql "$DATABASE_URL" -f sql/apply-platform-reliability.sql`

Production application **requires your explicit authorization**.
