# Payment recovery

DigitalSkillX records incomplete Paystack orders, verifies their real payment status and sends recovery emails with a fresh Paystack checkout link and WhatsApp support.

## Coverage

The recovery system captures:

- Native course checkout before redirecting to Paystack.
- Commerce offer and course bundle checkout.
- NGN learning-path certificate checkout.
- Known Paystack Payment Page products, including the configured DigitalSkillX Payment Page catalog.

Payment Page transactions are collected from Paystack because those buyers may never visit the DigitalSkillX checkout page. The scheduled importer checks failed and abandoned transactions from the last six hours, up to 25 pages of 100 rows per status per run. It matches known catalog products and ignores successful, unknown or mismatched transactions. The unique transaction reference makes repeated scans idempotent.

USD learning-path certificate checkout is not captured by this recovery flow.

## How it works

1. The checkout route stores the customer's email, product identity and server-calculated amount before sending the buyer to Paystack. It never trusts a price supplied by the browser.
2. One open recovery group represents one email and product. Every payment reference becomes an attempt under that group. A successful payment, an existing enrollment or a verified suppression stops further reminders.
3. Coolify calls `/api/cron/payment-recovery` every five minutes. The route:
   - Imports eligible failed and abandoned Paystack Payment Page records.
   - Verifies pending references directly with Paystack.
   - Treats `success` as paid only when the amount and currency match the saved checkout.
   - Sends the first recovery email about 10 minutes after a confirmed failure, or after the 30-minute abandonment window and verification.
   - Leaves pending, ongoing, processing and unreachable transactions unresolved. It does not email while payment remains active.
   - Closes a group after verified payment and cancels the remaining sequence.
4. Paystack `charge.success` webhooks remain the immediate success signal. Payment Page purchases continue through the existing external fulfilment and access-email flow. Recovery reconciliation provides a second check for Payment Page attempts already imported.
5. Every recovery email includes a new Paystack retry link. Opening the link only displays the order. The buyer must press the button before the system creates a fresh transaction reference. Before retry, the server reloads the current price from the course, bundle, offer, digital product or certificate record. The browser and stored recovery amount never determine the Paystack charge.
6. The sequence sends at most seven emails over five days. Each message has an idempotency key. Emails only send between 08:30 and 20:00 Africa/Lagos, with at least two hours between sends. Payment, opt-out, bounce, complaint and suppression stop the sequence.
7. The Resend webhook records delivery, delay, bounce, complaint, failure and suppression events.

## Customer payment options

Recovery emails currently show two options:

- Complete payment through a fresh Paystack checkout. Paystack displays the payment methods available for that transaction.
- Contact DigitalSkillX through WhatsApp at 09023986992.

Direct transfer to the supplied Wema account is disabled until the bank account name is confirmed. The email and admin page do not expose the account number or an unverified account name. The admin transfer-confirmation code remains in place but the customer-facing transfer option and its confirmation controls stay hidden while `bankTransferEnabled` is false.

## Production setup

The source code alone does not activate scheduled emails. Complete these steps in the production environment.

1. Check and apply database migrations from the DigitalSkillX application container. Run:
   ```bash
   npm run db:migrate -- --status
   npm run db:migrate -- --dry-run
   npm run db:migrate
   ```
   The runner uses `DATABASE_URL` and tracks applied versions. It applies the payment recovery schema and product-type migration without editing older migration files. Confirm migrations 0058_payment_recovery.sql, 0059_recovery_seven_email_sequence.sql and 0060_payment_recovery_product_types.sql show as applied before enabling the feature.
2. Create this Coolify scheduled task. The repository task plan records it as required but not yet confirmed in Coolify:
   - Schedule: `*/5 * * * *`
   - Command:
   ```bash
   curl -fsS -m 300 -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/payment-recovery
   ```
   Do not create a duplicate Vercel schedule for the same route.
3. Add these runtime variables in Coolify:
   - `PAYMENT_RECOVERY_ENABLED=true`
   - `RESEND_WEBHOOK_SECRET=<secret from Resend>`
   Keep the existing `CRON_SECRET`, `RESEND_API_KEY` and `RESEND_FROM_EMAIL` values configured.
4. In Resend, create a webhook at `https://www.digitalskillx.com/api/webhooks/resend` and subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed`. Store the signing secret as `RESEND_WEBHOOK_SECRET` in Coolify.
5. Keep the existing Paystack webhook routing through Leadthur. It must continue forwarding verified `charge.success` events to DigitalSkillX.
6. After deployment and setup, call `/api/cron/payment-recovery` once with the cron authorization header. Confirm its response reports `enabled: true` and that `pagePull` and reconciliation complete without a database error.

The existing `/api/cron/checkout-abandon` route skips its old reminder behaviour when payment recovery is enabled. This avoids sending duplicate abandoned-checkout emails.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAYMENT_RECOVERY_ENABLED` | `false` | Master switch for verification and email sends |
| `RESEND_WEBHOOK_SECRET` | unset | Verifies signed Resend delivery events |
| `PAYMENT_RECOVERY_FIRST_FAILED_DELAY_MINUTES` | `10` | Delay after confirmed failure |
| `PAYMENT_RECOVERY_ABANDONED_DELAY_MINUTES` | `30` | Inactivity before abandonment |
| `PAYMENT_RECOVERY_MIN_GAP_MINUTES` | `120` | Minimum spacing between emails |
| `PAYMENT_RECOVERY_WINDOW_START_MINUTES` | `510` | Start of email window, Lagos time |
| `PAYMENT_RECOVERY_WINDOW_END_MINUTES` | `1200` | End of email window, Lagos time |
| `PAYMENT_RECOVERY_VERIFY_INTERVAL_MINUTES` | `5` | Base re-verification interval |
| `PAYMENT_RECOVERY_BATCH_LIMIT` | `40` | Maximum attempts and emails per run |

## Admin pages

- `/admin/payment-recovery`: overview, filters, table, analytics and CSV export.
- `/admin/payment-recovery/[id]`: references, verification history, email events, notes and timeline.
- `/admin/payment-recovery/historical`: review older eligible orders and queue a limited batch. Queued orders are verified again before any email.

Admin actions require `requireAdmin()` and write to `audit_logs`.

## Reporting definitions

- Order: one open recovery group for an email and product.
- Completion rate: paid orders divided by all orders.
- Recovery rate: orders paid after a recovery email divided by orders that failed or were abandoned.
- Recovered order: paid by verified Paystack transaction or admin-confirmed bank transfer after at least one recovery email.
- Recovery revenue: verified amount from recovered orders only.

## Seven-email sequence

Hours count from the first recovery email.

| # | Step | After first email | Subject |
| --- | --- | --- | --- |
| 1 | `initial` | 0 | Your {product} payment is not complete |
| 2 | `followup_3h` | 3 hours | Would you like to try your payment again? |
| 3 | `help_12h` | 12 hours | You can still complete your {product} purchase |
| 4 | `reminder_24h` | 24 hours | Still interested in {product}? |
| 5 | `reminder_48h` | 48 hours | Need help completing your payment? |
| 6 | `reminder_72h` | 72 hours | Your {product} order is still incomplete |
| 7 | `final_120h` | 120 hours | Last reminder about your {product} checkout |

The first email follows the confirmed failure or abandonment delay. Recovery stops after the final email, payment, opt-out, bounce, complaint or suppression. Retries do not restart the sequence.
