# AI Ads Automation Masterclass: payment to access

Flow: WordPress sales page, Paystack page, one live webhook (LeadPilot router), signed HMAC handoff, DigitalSkillX fulfilment, WordPress thank-you page.

## Product identity
- DSX key: ai-ads-automation-masterclass. Course ID 4e2a16b5-bbfb-4a00-939c-87c7eb5f2afb. NGN 14,999 (1,499,900 kobo). Paystack slug ai-ads-masterclass.
- Build Software With AI (key build-software-with-ai): course 9818cf69-4158-40b5-8926-54a3be38f306, NGN 49,999 (4,999,900 kobo), Paystack slug aiapp. Price confirmed from the live Paystack page and the DSX course price.
- The Paystack page with slug ai-app (NGN 14,999, "Build, Launch & Monetize Mobile Apps With AI") is a different product. It is not mapped to any course. A payment on it fails the amount check and is not enrolled.

## Env vars (names only)
- DIGITALSKILLX_FORWARD_SECRET on LeadPilot and DigitalSkillX (same value).
- META_CAPI_TOKEN_1043090941844015 on DigitalSkillX (fallback META_CAPI_TOKEN). Status unverified: no access to the deployment settings.
- Optional PAYSTACK_AIADS_COURSE_ID.

## Course readiness (do not publish until done)
The masterclass course is Draft with 0 modules. Fulfilment refuses an unpublished course with a permanent 422 (course_not_published), so a payment before publication is taken by Paystack and not enrolled. Publishing emails and notifies every paid DigitalSkillX student unless "Coming soon" is on, and Coming soon blocks enrolment. Required before publishing:
1. Real lessons in at least one module, with the lesson content, not placeholders.
2. Storefront title, short description, full description, learning outcomes, instructor, cover image (1280x720).
3. Price set to 14,999 NGN on the course.
4. Enrollment mode and completion rules chosen.
5. A decision on the publish notification to existing students.
6. One test enrolment with an inbox you own.

## Go-live order
1. Merge LeadPilot PR 1. Update LEADPILOT_SHA in .github/workflows/production-release.yml to the merge SHA.
2. Merge DigitalSkillX PR 4. Deploy LeadPilot, then DigitalSkillX.
3. Set the Meta token. Publish the course.
4. Run one test-mode payment end to end and confirm the access email and status endpoint.
5. Install docs/wordpress/aimad-snippet-v2.php (thank-you page). Back up the current snippet first.
6. Install docs/wordpress/aimad-checkout-links-v1.php, then switch on with update_option('aimad_checkout_live', '1').

## WordPress snippets
Backup: in Code Snippets use Export on the current "AI Ad Masterclass - Meta Pixel Events + Thank You Page" snippet and keep the file. Install by replacing the whole snippet body with the v2 file. v2 keeps the landing-page Meta events section unchanged, moves payment verification and Purchase to DigitalSkillX, and drops the old WordPress settings page.
Checkout links: a separate snippet. It does nothing until aimad_checkout_live is 1. It rewrites a.buy links that point to #checkout (server side) and adds utm_source, utm_medium, utm_campaign, utm_content, utm_term and fbclid (browser side, with the aimad_attr cookie as fallback).
Rollback: set aimad_checkout_live to 0, or deactivate the snippet. The page content is never edited.
Tests: npm run test:ai-ads-wordpress (needs php and playwright), npm run test:ai-ads-journey (needs LEADRUSH_BACKEND_DIR with LeadPilot source).

## Rollback
1. Set aimad_checkout_live to 0 (buttons return to #checkout).
2. Restore the exported thank-you snippet.
3. Revert the DigitalSkillX merge, then the LeadPilot merge, and redeploy.
No database migration is involved.

## Known external state
- Vercel reports "Account is blocked" on both repositories. See the PR notes. It does not affect code correctness. LeadPilot ships a railway.toml and DigitalSkillX settings mention Coolify, so neither appears to deploy through Vercel. Confirm in your hosting accounts.
