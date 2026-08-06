# Enrollment Link System

## Overview

Shareable enrollment links grant students access to one or more courses after they register or log in. The public experience looks like a purchase invite — no admin jargon.

**Enrollment Link redeem** uses `lib/enrollment-engine.ts`.  
**Purchase / admin / bulk / free / automation** keep their existing production implementations (do not call the engine yet).

## Production safety

| Source | Implementation |
|--------|----------------|
| Purchase | `lib/purchase.ts` |
| Admin grant | `grantCourseAccessToStudent` |
| Bulk import | `grantCourseAccessForBulkImport` (eligibility for IMPORTED_STUDENTS only) |
| Free / self | `app/api/payments/initialize/route.ts` |
| Automation enroll | `lib/automation.ts` `enroll_course` |
| Enrollment links | `redeem-service` → `claim_enrollment_link_redemption` → `enrollStudent` |

Feature flag: `ENROLLMENT_LINKS_ENABLED` (default `true`). Set `false` to disable link APIs/admin without touching other enroll paths.

## Database

**Apply before go-live:**

- `supabase/migrations/0033_enrollment_links.sql`
- or `sql/apply-enrollment-links.sql` in the Supabase SQL Editor

### Objects

| Object | Purpose |
|--------|---------|
| `enrollment_links` | Metadata, `token_hash`, limits, redirect, soft delete |
| `enrollment_link_courses` | Multi-course packages |
| `enrollment_link_redemptions` | Idempotent `(link_id, user_id)` |
| `enrollment_events` | Append-only funnel / admin events |
| `claim_enrollment_link_redemption` | `FOR UPDATE` claim + increment |
| `enrollment_source` += `enrollment_link` | Source on enrollments |

Tokens: plaintext `el_` + 256-bit base64url shown **once** at create; only SHA-256 hash stored.

### Related (Account Security)

`0034_account_sessions.sql` / `sql/apply-account-sessions.sql` — device sessions (separate feature).

## Architecture

```
Admin UI → /api/admin/enrollment-links → link-service
Public  → /enroll/[token]
            → GET  /api/enroll/[token]     validation DTO + link_opened
            → POST /api/enroll/[token]     redeem (auth required)
            → POST /api/enroll/[token]/event  funnel events
```

### Services

| Module | Role |
|--------|------|
| `lib/enrollment-engine.ts` | Enroll writer for links |
| `lib/enrollment-links/token.ts` | Generate / hash |
| `lib/enrollment-links/validation-service.ts` | Load + friendly errors |
| `lib/enrollment-links/link-service.ts` | CRUD / soft-delete / duplicate |
| `lib/enrollment-links/redeem-service.ts` | Claim-then-enroll |
| `lib/enrollment-links/analytics-service.ts` | Admin analytics |
| `lib/enrollment-links/events.ts` | Append-only events |
| `lib/enrollment-links/feature-flag.ts` | Kill switch |

## Routes (UI)

| Path | Role |
|------|------|
| `/admin/enrollment-links` | List / filter / actions |
| `/admin/enrollment-links/new` | Create wizard |
| `/admin/enrollment-links/[id]` | Edit + analytics + redemptions |
| `/enroll/[token]` | Student invite (auto-redeem if logged in) |
| `/enrollment/success` | Post-enroll welcome |

## APIs

| Method | Path | Auth |
|--------|------|------|
| GET/POST | `/api/admin/enrollment-links` | Admin |
| GET/PATCH/DELETE | `/api/admin/enrollment-links/[id]` | Admin |
| GET | `/api/enroll/[token]` | Public |
| POST | `/api/enroll/[token]` | Student session |
| POST | `/api/enroll/[token]/event` | Public (rate-limited) |

## Access types

- **public** — anyone with the link  
- **imported_students** — email in `profiles` ∪ `bulk_import_rows`

## Redirects

| Type | Destination |
|------|-------------|
| `success_page` | `/enrollment/success?link=…` |
| `first_course` | `/courses/{first}` |
| `dashboard` | `/dashboard` |
| `specific_course` | `/courses/{id}` |

Continue Learning: **1 course → that course**, else dashboard.

## Student flow

1. Open `/enroll/{token}` → courses preview  
2. Create account / Log in with `?next=/enroll/{token}`  
3. Return authenticated → auto POST redeem (no second click)  
4. Redirect per link settings  
5. Emails / in-app notify / `course_enrolled` automations via engine for newly enrolled courses  

## Security

- Token hash only at rest; plaintext once at create  
- Redeem requires authenticated **student** (not admin)  
- Max redemptions under row lock in RPC  
- Soft delete (`deleted_at` + `status=deleted`)  
- Rate limits on admin + public enroll routes  
- Funnel event endpoint does not leak whether a token is valid  
- Public middleware allows `/enroll`, `/enrollment`, `/api/enroll`  

## Emails / notifications / automations

Reuse existing welcome / enrollment email, in-app notify, and `course_enrolled` automations — no duplicate templates.

## Testing

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:enrollment-links
npm run build
# with app running:
npm run test:e2e
# with .env.test against staging/prod:
npm run test:cert
```

Coverage includes: token crypto, validation matrix, redirects, production-writer isolation, Playwright public smokes + responsive login/register.

## Deployment

1. Apply `sql/apply-enrollment-links.sql` on production Supabase  
2. Deploy app (Vercel)  
3. Confirm `ENROLLMENT_LINKS_ENABLED` (omit or `true`)  
4. Smoke: create link in admin → open URL logged out → register → auto enroll  

## Rollback

1. Set `ENROLLMENT_LINKS_ENABLED=false` (kills APIs/UI)  
2. Soft-delete / disable links in admin if needed  
3. Revert app deploy  
4. Tables may remain; drop only after traffic drained  

## Troubleshooting

| Symptom | Check |
|---------|--------|
| 500 on `/api/enroll` | Migration / RPC missing |
| FEATURE_DISABLED | `ENROLLMENT_LINKS_ENABLED=false` |
| Imported only | Email not in profiles or bulk_import_rows |
| Limit reached | `max_redemptions` vs `current_redemptions` |
| Duplicate redeem OK | Unique `(link_id, user_id)` + enroll unique `(student_id, course_id)` |

## Future integrations

- Migrate admin grant → engine (one source, flagged, tested)  
- Then free enroll → purchase last  
- VideoProvider (`docs/SECURE-VIDEO-ARCHITECTURE.md`) — no migration yet  

See also: `docs/ENROLLMENT-LINK-ARCHITECTURE-PLAN.md`, `docs/ENROLLMENT-LINK-PRODUCTION-RULES.md`.
