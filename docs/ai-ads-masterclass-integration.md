# AI Ads Automation Masterclass: payment to access

Flow: sales page, Paystack page, one live webhook (LeadPilot router), signed HMAC handoff, DSX fulfilment, WordPress thank-you page.

## DSX changes
- lib/paystack-external-products.ts: new product, evidence-first identification, allowAmountOnlyFallback (ai-app only).
- lib/purchase-status.ts and app/api/purchase-status/route.ts: public read-only status. "paid" only when the transaction is success and an enrolment exists.
- lib/purchase-tracking-payload.ts and purchase-tracking.ts: Meta CAPI Purchase, event_id purchase_<reference>, hashed email, per-pixel token.
- scripts/certification/test-ai-ads-masterclass.mjs: 35 checks.

## Env vars
- META_CAPI_TOKEN_1043090941844015 (or META_CAPI_TOKEN valid for that pixel)
- DIGITALSKILLX_FORWARD_SECRET (shared with LeadPilot, already exists)
- PAYSTACK_AIADS_COURSE_ID (optional override)

## Before go-live
1. Merge and deploy LeadPilot, then update LEADPILOT_SHA in .github/workflows/production-release.yml.
2. Merge and deploy DSX. Publish the course (it is Draft; enrolment needs it published).
3. Install wordpress/aimad-snippet-v2.php in place of the current snippet.
4. Point the Buy Now buttons at https://paystack.shop/pay/ai-ads-masterclass, keeping UTM and fbclid.
5. Run one test-mode payment.

## Known issue, not changed
ai-app expects 1,499,900 kobo in DSX and 4,999,900 in the router. DSX rejects that handoff with amount_mismatch. Decide which price is correct.

No database migration.
