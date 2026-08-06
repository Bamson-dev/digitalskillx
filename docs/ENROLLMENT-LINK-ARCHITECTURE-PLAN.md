# DigitalSkillX — Enrollment Link System
## Consolidated Architecture Plan (Spec Parts 1 + 2 + 3)

**Status:** APPROVED — implementation in progress / largely complete  
**Scope:** Database → EnrollmentEngine → services/APIs → Admin/Student UI → Course Editor UX → tests/docs  
**Repo mapping date:** 2026-08-06

---

## 0. Part 3 additions (UX / product / QA)

Part 3 is binding for UI, emails/notifications/automations reuse, analytics UX, Course Editor improvements, Playwright/E2E, regression, docs, and final acceptance.

### UX philosophy
- Student experience identical to a purchase (no “enrollment link” jargon on student surfaces).
- Auto-continue after register/login — **never** a second “Enroll” click.
- Admin self-explanatory; no alerts — toasts + loading/skeleton states.

### Course Editor (ship in same initiative)
File: `components/admin/course-editor.tsx` (+ settings form if save lives there).
- Save → “Saving…” + disabled button → toast “Course saved successfully.” → brief “Saved” → “Save Changes”.
- Preserve form data on validation failure; scroll to first invalid field.
- Move “Import from YouTube” / `YoutubeImport` into collapsible **Advanced Tools** (do not remove YouTube lesson support).

### Toast system
**Gap:** no toast library in the repo today. Add a small shared toast (`components/ui/toast.tsx` + provider) used by Enrollment Links **and** Course Editor — no `alert()`.

### Playwright
**Gap:** Playwright is **not** in `package.json`. Part 3 requires it.
- Add `@playwright/test` + `e2e/enrollment-links.spec.ts` (and smoke regression specs).
- Keep existing Node cert scripts (`scripts/test-*.mjs`) for API/server certs; Playwright covers browser UX.

### Documentation deliverable
Create `docs/ENROLLMENT_LINK_SYSTEM.md` (architecture, DB, APIs, routes, UI, security, testing, future integrations, troubleshooting, deploy/rollback, diagrams). Keep this planning doc as `docs/ENROLLMENT-LINK-ARCHITECTURE-PLAN.md`.

---

## 1. Spec reconciliation (Part 1 vs Part 2)

| Topic | Part 1 | Part 2 | Decision |
|-------|--------|--------|----------|
| Multi-course | Package → items | `enrollment_link_courses` | **Follow Part 2** |
| Soft delete | — | `deleted_at` | **Follow Part 2** |
| Status | active/disabled | ACTIVE/DISABLED/EXPIRED/DELETED | Add **`draft`** for Part 3 yellow Draft; create defaults to **active** |
| Access | Public / Imported | PUBLIC / IMPORTED_STUDENTS | **Follow Part 2** |
| Token | random | `el_` ≥40; prefer hash | **Store `token_hash`; plaintext once at create** |
| Audit | — | `enrollment_events` | Append-only + existing `audit_logs` |
| Layering | services | routes→services→repos→DB | `lib/enrollment-links/` |

---

## 2. Existing architecture (reuse / do not break)

| Source | File | Keep outside engine |
|--------|------|---------------------|
| Admin | `grantCourseAccessToStudent` | — |
| Bulk | `grantCourseAccessForBulkImport` | Email outbox deferred |
| Purchase | `lib/purchase.ts` | Tx claim + receipt email |
| Free/self | `payments/initialize` | — |
| Automation | `enroll_course` | Silent parity |

Reuse: Auth/`safeNextPath`, system email triggers, notifications, `runAutomations("course_enrolled")`, `lib/audit.ts`, rate limits, admin auth.

Only extend `enrollment_source` with `enrollment_link` — do not reshape `enrollments`.

---

## 3. Database (Part 2 + Part 3 redirect/draft)

**Files:** `supabase/migrations/0033_enrollment_links.sql`, `sql/apply-enrollment-links.sql`, `types/database.ts`

### Enums
```sql
enrollment_link_status:  'draft' | 'active' | 'disabled' | 'expired' | 'deleted'
enrollment_link_access:  'public' | 'imported_students'
enrollment_link_redirect:'success_page' | 'first_course' | 'dashboard' | 'specific_course'
-- extend: enrollment_source += 'enrollment_link'
```

### Tables
- **`enrollment_links`** — token_hash UNIQUE, token_prefix, name, description, status, access_type, max/current redemptions, expires_at, redirect_type, redirect_course_id, created_by, timestamps, deleted_at; CHECK current ≤ max when max set
- **`enrollment_link_courses`** — UNIQUE (link_id, course_id)
- **`enrollment_link_redemptions`** — UNIQUE (link_id, user_id); ip/ua/browser/device/country/city; indexes on user, email, link, redeemed_at
- **`enrollment_events`** — append-only; events for admin lifecycle + funnel (opened, registration/login started/completed, redemption attempt/success/fail, continue_learning)

### Redeem transaction
User must already be authenticated → PG `FOR UPDATE` on link → re-validate → engine enroll → insert redemption → increment → events → COMMIT → emails/notify/automations only for newlyEnrolled.

### IMPORTED_STUDENTS
Email in **profiles ∪ bulk_import_rows**. Friendly Part 3 copy on reject.

---

## 4. Backend layout

```
app/api/admin/enrollment-links/**     thin adapters
app/api/enroll/[token]/route.ts      GET DTO / POST redeem
app/(admin)/admin/(panel)/enrollment-links/**
lib/enrollment-engine.ts
lib/enrollment-links/{token,repository,validation-service,link-service,redeem-service,analytics-service,events}.ts
components/ui/toast.tsx
```

---

## 5. EnrollmentEngine

`enrollStudent(...)` with sources including `enrollment_link`. Rewire all writers. Same automation events as purchase enroll.

---

## 6. Admin UI (Part 3)

**Nav:** Enrollment Links after Courses in `admin-sidebar.tsx`.

**List** `/admin/enrollment-links` — filters, sorts, table, actions (View/Edit/Copy/Analytics/Disable/Enable/Duplicate/Delete), status colors.

**Create wizard** `/admin/enrollment-links/new` — Basic → Courses → Rules → Redirect (default Success Page) → Review. Post-create: URL + Copy/Open/Create Another + toast.

**Detail** `/admin/enrollment-links/[id]` — edit + redemptions + analytics (visits, enrollments, conversion, countries, devices, remaining slots, emails/automations, time-to-register).

---

## 7. Student UI (Part 3)

**`/enroll/[token]`** — marketplace invite; course cards; Create Account / Login with `next`; authed → auto-enroll. Error states for expired/disabled/max/imported/empty.

**`/enrollment/success`** — welcome, course cards at 0%, summary stats, subtle confetti; Continue Learning: 1 course → curriculum, else dashboard.

Register/login honor `next` and emit analytics events.

---

## 8. Emails / notifications / automations

Reuse only — welcome, course enrollment email, in-app enrollment notify, `course_enrolled` automations via engine.

---

## 9. Course Editor UX

Save feedback + Advanced Tools for YouTube import (keep feature).

---

## 10. Testing & quality

- Unit: services first  
- API: `scripts/test-enrollment-links.mjs`  
- E2E: Playwright (§54 scenarios)  
- Regression: purchase, admin enroll, bulk, free, certs, auth, dashboards, etc.  
- `typecheck`, `lint`, `build` clean  

---

## 11. Final acceptance (Part 3 §58)

Integrated engine; admin manage/analyze; smooth student redeem; reused comms; success page future-ready; course editor improved; no regressions; tests/docs/build green.

---

## 12. Implementation order (after approval)

1. Migration + types  
2. Engine + rewire + unit tests  
3. Link services + redeem RPC + unit tests  
4. APIs  
5. Toast primitive  
6. Admin UI (list/wizard/detail)  
7. Public enroll + success + auth `next`  
8. Course Editor polish  
9. Playwright + cert + regressions  
10. `docs/ENROLLMENT_LINK_SYSTEM.md`  

---

**Awaiting approval to begin implementation.**  
Default IMPORTED_STUDENTS = profiles ∪ bulk_import_rows.
