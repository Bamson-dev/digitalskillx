# Production engineering rules — Enrollment Links

These rules are binding for DigitalSkillX (live production).

## Compliance snapshot (this initiative)

| Rule | Status |
|------|--------|
| Extend, do not rewrite | Enrollment Links are additive tables/APIs/UI |
| Do not rewrite auth/payments/certs/quizzes/… | Untouched except Course Editor save toast + Advanced Tools wrap |
| Do not migrate all enroll sources at once | **Corrected:** purchase / admin / bulk / free / automation restored to HEAD implementations |
| Never break payments | `lib/purchase.ts` = production path |
| Never redesign bulk import | `grantCourseAccessForBulkImport` = production path; links only read `bulk_import_rows` for IMPORTED_STUDENTS |
| Keep emails / automations | Existing triggers/actions reused; link redeem calls engine which reuses them |
| Feature flag | `ENROLLMENT_LINKS_ENABLED` gates link APIs/admin surface |
| Baseline before refactor | Unit check asserts production writers do not import `enrollment-engine` |
| Incremental order | DB → services → admin → student → success → analytics; existing enroll migration deferred |

## Allowed next migration order (only after baselines)

1. Document current behavior for one source (e.g. admin grant).
2. Add parity tests.
3. Switch that source to the engine behind a dedicated flag (default off).
4. Verify production regressions.
5. Enable flag; remove flag after soak.
6. Next source.

Do not migrate purchase until admin grant has soaked successfully.
