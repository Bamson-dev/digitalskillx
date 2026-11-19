# DigitalSkillX transactional email: Zoho ZeptoMail

Transactional application email now uses the Zoho ZeptoMail SMTP transport.

```
Transactional email triggers → lib/email sendEmail → Zoho ZeptoMail SMTP → recipient
```

The application uses the configured SMTP credentials from Coolify. It does not fall back to Resend.

## Coolify runtime settings

| Variable | Default / purpose |
|---|---|
| `EMAIL_PROVIDER` | `zeptomail` |
| `ZEPTOMAIL_SMTP_HOST` | `smtp.zeptomail.com` |
| `ZEPTOMAIL_SMTP_PORT` | `587` (STARTTLS) or `465` (implicit TLS) |
| `ZEPTOMAIL_SMTP_USER` | `emailapikey` |
| `ZEPTOMAIL_SMTP_PASSWORD` | Agent SMTP password, secret |
| `ZEPTOMAIL_FROM_EMAIL` | Verified sender address, for example `courses@digitalskillx.com` |
| `ZEPTOMAIL_FROM_NAME` | `DigitalSkillX` |

Keep credentials in Coolify's encrypted runtime environment. Never add them to source control, client variables, or build arguments.

The SMTP transport requires a valid TLS certificate. It refuses plaintext SMTP and does not disable certificate verification.

## Transactional email coverage

The shared `sendEmail()` function routes account, password/access, purchase, enrollment, welcome, and other one-to-one application messages through Zoho. The bulk-import welcome-email outbox uses the same transport and keeps its existing retry flow.

## Marketing email

Zoho ZeptoMail is reserved for transactional email. It is not used for promotional sequences, newsletters, bulk announcements, AI Money Code campaigns, or webinar follow-up campaigns. Those campaign senders remain disabled until a marketing email service such as Zoho Campaigns is connected.

## Verification

Use the admin test path for an individual transactional message and confirm the accepted message appears in the Zoho CPaaS email logs. A successful SMTP submission confirms acceptance by the SMTP server, not inbox placement.
