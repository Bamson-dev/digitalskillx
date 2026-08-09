# Resend email (DigitalSkillX — Resend only)

Transactional email is delivered **only** through the Resend HTTP API.

```
Email triggers → lib/email sendEmail → Resend API → recipient
```

There is **no** SMTP path and **no** ZeptoMail delivery path.

## Coolify environment (server only)

| Variable | Value |
|----------|--------|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | Resend API key (`re_…`) — never `NEXT_PUBLIC_` |
| `RESEND_FROM_EMAIL` | `courses@digitalskillx.com` |
| `RESEND_FROM_NAME` | `DigitalSkillX` |

Configure these in Coolify Runtime for the production app that runs Next.js / cron workers.

## Outbox

`bulk_import_email_outbox`, `drainBulkImportEmailOutbox`, and `/api/cron/email-outbox` are unchanged and call `sendEmail()` → Resend.

## No database migration required
