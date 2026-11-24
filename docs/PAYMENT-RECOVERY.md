# Payment recovery (failed and abandoned Paystack checkouts)

Scope: DigitalSkillX native course checkout (`/api/payments/initialize`). The customer gives
name, email and (optional) phone on DigitalSkillX before Paystack opens. Paystack Payment Page
products (paystack.shop, e.g. the AI Ads WordPress buttons) are not covered: Paystack collects
their email, so there is nothing to capture before checkout. They keep their own reconcile job.

## How it works

1. `POST /api/payments/initialize` inserts the pending `transactions` row (unchanged) and then
   records the attempt in `payment_recovery_groups` / `payment_recovery_attempts`. Price and
   product come from the `courses` row. Capture runs even while the feature switch is off.
2. One group = one order = one lowercased email + one course while open. Every Paystack
   reference for that order (checkout, retries) is an attempt in the group.
3. Cron `/api/cron/payment-recovery` (every 5 minutes):
   - Verifies due attempts with `GET /transaction/verify/:reference`.
     - `success` + exact amount/currency: runs the existing `completePaidCheckout` (same enrolment
       and success email as normal checkout), then closes the group.
     - `failed`: attempt failed, first email 10 minutes later.
     - `abandoned` or not found: abandoned only once the checkout is 30 minutes old, first email then.
     - `ongoing` / `pending` / `processing` / `queued`: stays pending, re-checked (5 min, then 30 min, then 6 h).
     - Paystack unreachable: no status change, backoff 5 min to 6 h.
     - `reversed`: marked reversed, no emails, never treated as paid.
   - Sends due emails: initial, +24 h reminder, +48 h final, then stops. Before every send it
     re-checks: paid on any attempt or enrolled already, active payment in the last 2 h,
     suppression/opt-out, valid email.
4. Paystack does not send `charge.failed` or `charge.abandoned` webhooks (only `charge.success`
   for payments). Failures are found by reconciliation. `charge.success` webhooks close the
   group immediately through `recoveryOnPaymentSucceeded`.
5. Retry link `GET /api/payment-recovery/retry?t=<token>` shows the order. `POST` (button)
   creates a fresh reference and transaction row, initialises Paystack with the current course
   price, and redirects. GET never creates a transaction, so email link scanners are harmless.
6. Bank transfer: each order has a unique `DSX-REC-XXXXXX` narration reference. Only an admin can
   confirm, after seeing the credit. Exact amount required, otherwise "investigating". Confirmation
   runs the existing `fulfillPurchase` once (unique on the bank reference).
7. Resend webhook `/api/webhooks/resend` (Svix-signed) records delivered, delayed, bounced,
   complained, failed and suppressed. Hard bounces, complaints and Resend suppressions stop all
   recovery email to that address.

Meta: native checkout has no server-side Purchase event today, so recovery adds none. A Paystack
retry ends on the same success page as normal checkout. Bank transfers send no Purchase event.

## Setup checklist

1. Apply `supabase/migrations/0058_payment_recovery.sql` (additive). Rollback:
   `supabase/migrations/rollback/0058_payment_recovery_down.sql`.
2. Coolify scheduled task (same pattern as existing tasks):
   `curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/payment-recovery`
   schedule `*/5 * * * *`.
3. Resend dashboard > Webhooks > add `https://www.digitalskillx.com/api/webhooks/resend` with events
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`,
   `email.failed`, `email.suppressed`. Copy its signing secret into Coolify as `RESEND_WEBHOOK_SECRET`.
4. Paystack webhook stays `https://backend.leadthur.com/webhooks/paystack` (LeadPilot router), which
   forwards to DigitalSkillX. No change needed.
5. Set `PAYMENT_RECOVERY_ENABLED=true` in Coolify and redeploy. The old
   `/api/cron/checkout-abandon` reminder switches itself off when this is on.

## Environment variables (new)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAYMENT_RECOVERY_ENABLED` | `false` | Master switch for verification jobs and emails |
| `RESEND_WEBHOOK_SECRET` | none | Svix signing secret from Resend |
| `PAYMENT_RECOVERY_FIRST_FAILED_DELAY_MINUTES` | `10` | Delay after a confirmed failure |
| `PAYMENT_RECOVERY_ABANDONED_DELAY_MINUTES` | `30` | Inactivity before abandoned |
| `PAYMENT_RECOVERY_REMINDER_24H_ENABLED` | `true` | Second email |
| `PAYMENT_RECOVERY_REMINDER_48H_ENABLED` | `true` | Final email |
| `PAYMENT_RECOVERY_REMINDER_1_HOURS` / `_2_HOURS` | `24` / `48` | Reminder timing after the first email |
| `PAYMENT_RECOVERY_VERIFY_INTERVAL_MINUTES` | `5` | Base re-verify interval |
| `PAYMENT_RECOVERY_BATCH_LIMIT` | `40` | Attempts and emails per run |

Reused: `CRON_SECRET`, Paystack secret (existing loader), Resend key and sender (existing `sendEmail`).

## Admin

- `/admin/payment-recovery`: overview, filters, table, analytics, CSV export.
- `/admin/payment-recovery/[id]`: references, verification history, emails, delivery events,
  bank confirmation, notes, timeline.
- `/admin/payment-recovery/historical`: review older pending/failed course checkouts, queue a
  limited batch (type QUEUE). Queued orders are re-verified before any email.

All actions use `requireAdmin()` and write `audit_logs`.

## Reporting definitions

- Order = one group (email + course). Repeated attempts do not inflate counts.
- Completion rate = paid orders / all orders.
- Recovery rate = recovered orders / orders that failed or were abandoned.
- Recovered = paid (Paystack verified or admin-confirmed transfer) after at least one recovery email.
- Recovery revenue = verified amount of recovered orders only.
