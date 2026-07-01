# Sentry setup for DigitalSkillX (staging / production)

## 1. Create a Sentry project
1. Sign in at https://sentry.io
2. Create an organization (or use an existing one)
3. Add a project → platform **Next.js**
4. Copy the **DSN** from Project Settings → Client Keys

## 2. Environment variables
Add to staging (Vercel / `.env.local`):

```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxxx@xxxx.ingest.sentry.io/xxxx
SENTRY_ENVIRONMENT=staging
```

Optional (source maps upload on build):

```bash
SENTRY_AUTH_TOKEN=your_sentry_auth_token
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=digitalskillx
```

## 3. What is captured
- Unhandled frontend errors (React error boundaries / client exceptions)
- Unhandled server errors via `onRequestError`
- Failed Paystack webhook signature / verification (`captureMessage` in webhook route)
- Failed API responses can be wrapped with `Sentry.captureException` as routes are extended

## 4. Verify
1. Deploy staging with `NEXT_PUBLIC_SENTRY_DSN` set
2. Trigger a test error (e.g. visit a broken route in dev with DSN set)
3. Confirm the event appears in Sentry Issues within ~1 minute

## 5. Production
Use a separate Sentry project or `SENTRY_ENVIRONMENT=production` before go-live.
