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
3. The production container starts the recovery scheduler after the local application health check passes. It calls `/api/cron/payment-recovery` every five minutes. A PostgreSQL advisory lock allows only one application replica to run a cycle at a time.
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

## Automatic production setup

For the Docker/Coolify production container, setup runs during every container start. You do not need to create a separate Coolify cron task or manually add the Resend webhook.

1. `scripts/start.mjs` runs the repository's tracked migration runner using `DATABASE_URL`. The runner applies pending migrations and verifies checksums for migrations it has already applied.
2. Startup loads the Paystack secret from `platform_secrets` when that row contains a configured value, matching the app's existing secret precedence. Otherwise it uses the runtime environment. It checks that `DATABASE_URL`, `CRON_SECRET`, a live `PAYSTACK_SECRET_KEY` and `RESEND_API_KEY` are available.
3. Startup checks Resend for the exact endpoint `https://www.digitalskillx.com/api/webhooks/resend`. It creates the endpoint when missing. If it already exists, it enables it and adds any missing recovery event subscriptions without removing other subscriptions. It retrieves the current signing secret from Resend and writes it to the app's private runtime environment file. It does not store the secret in the repository or database. These webhook management calls authenticate with `RESEND_WEBHOOK_API_KEY` (a Full access key) when that variable is set, and fall back to `RESEND_API_KEY` when it is not. Sending-access keys cannot manage webhooks — Resend returns HTTP 401 — so without a Full access key the webhook step fails and recovery stays disabled (fail-closed).
4. After Next.js responds successfully to its local health check, the container starts the recovery scheduler. The scheduler runs the recovery route every five minutes and uses a PostgreSQL advisory lock to avoid duplicate cycles across application replicas.
5. The startup wrapper enables `PAYMENT_RECOVERY_ENABLED` only after migrations and required integrations pass. If a setup step fails, the website still starts, but recovery remains disabled. Check the container logs for the missing environment value or integration error.
6. To pause recovery without removing its setup, set `PAYMENT_RECOVERY_FORCE_DISABLED=true` in the container environment and restart it. Leave it `false` for normal operation.

The existing Paystack webhook through Leadthur must continue forwarding verified `charge.success` events to DigitalSkillX. This automation does not replace or reconfigure that integration.

### Required production values

These values must already exist in Coolify or the existing platform secret store:

- `DATABASE_URL`: PostgreSQL connection used by the migration runner and scheduler.
- `CRON_SECRET`: bearer secret used by the recovery route and existing cron jobs.
- `PAYSTACK_SECRET_KEY`: may come from the runtime environment or `platform_secrets`.
- `RESEND_API_KEY`: the Sending-access key used to send all email, including recovery mail. This is the only key the sending code uses.
- `RESEND_WEBHOOK_API_KEY`: a separate Full access key used **only** by startup for Resend webhook verification, creation and reconciliation. It is never used to send email. Set it in Coolify alongside `RESEND_API_KEY`; when it is absent, webhook management falls back to `RESEND_API_KEY` (which fails with HTTP 401 if that key is Sending-access only, leaving recovery disabled).

`RESEND_FROM_EMAIL` is used when set. Otherwise startup falls back to `ZEPTOMAIL_FROM_EMAIL`, then `courses@digitalskillx.com`.

You do not need to set `PAYMENT_RECOVERY_ENABLED` or `RESEND_WEBHOOK_SECRET` manually. Startup manages both. Do not remove or rotate `CRON_SECRET`, Paystack or Resend credentials while deploying.

### After redeployment

Once you merge the startup automation and trigger the redeployment from Coolify, check the application container logs for:

- `Database migrations are up to date`
- `Resend recovery webhook ready`
- `PAYMENT_RECOVERY_ENABLED=true`
- `payment-recovery scheduler: active`

The scheduler waits for the local health check, runs a cycle and then continues on a five-minute cadence. Confirm at least one successful cycle in the logs. The cron route also returns `enabled: true` when called with the configured `CRON_SECRET`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PAYMENT_RECOVERY_FORCE_DISABLED` | `false` | Set to `true` to pause recovery |
| `PAYMENT_RECOVERY_FIRST_FAILED_DELAY_MINUTES` | `10` | Delay after confirmed failure |
| `PAYMENT_RECOVERY_ABANDONED_DELAY_MINUTES` | `30` | Inactivity before abandonment |
| `PAYMENT_RECOVERY_MIN_GAP_MINUTES` | `120` | Minimum spacing between emails |
| `PAYMENT_RECOVERY_WINDOW_START_MINUTES` | `510` | Start of email window, Lagos time |
| `PAYMENT_RECOVERY_WINDOW_END_MINUTES` | `1200` | End of email window, Lagos time |
| `PAYMENT_RECOVERY_VERIFY_INTERVAL_MINUTES` | `5` | Base re-verification interval |
| `PAYMENT_RECOVERY_BATCH_LIMIT` | `40` | Maximum attempts and emails per run |
| `PAYMENT_RECOVERY_ENABLED` | Managed at startup | Enables only after migration and integration checks pass |
| `RESEND_WEBHOOK_SECRET` | Managed at startup | Retrieved from Resend and kept in the private runtime environment |
| `RESEND_WEBHOOK_API_KEY` | Set in Coolify | Full access key used only for webhook management at startup; falls back to `RESEND_API_KEY` when unset |

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
