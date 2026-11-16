#!/usr/bin/env node
/**
 * Send ONE clearly labelled test event to Meta Events Manager > Test Events.
 * Not a payment. No order, no enrolment, no charge. Run inside the production container
 * so the token never leaves the server:
 *   node scripts/meta-capi-test-event.mjs TEST12345
 * The test code comes from Events Manager > Test Events. Events with a test code never
 * count towards production reporting. The token is read from META_CAPI_TOKEN_<pixel>.
 */
import { createHash } from "node:crypto";

const PIXEL = process.env.META_TEST_PIXEL_ID?.trim() || "1043090941844015";
const GRAPH = "v25.0";
const code = (process.argv[2] || process.env.META_TEST_EVENT_CODE || "").trim();
const token = process.env[`META_CAPI_TOKEN_${PIXEL}`] || process.env.META_CAPI_TOKEN;

if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
  console.error("Missing or malformed test event code. Pass it as the first argument.");
  process.exit(2);
}
if (!token) {
  console.error(`Token env META_CAPI_TOKEN_${PIXEL} is not set in this container.`);
  process.exit(3);
}

const eventId = `diagnostic_test_${Date.now()}`;
const body = {
  test_event_code: code,
  data: [
    {
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: "https://aimoneycode.com.ng/ai-ad/thank-you/",
      user_data: { em: [createHash("sha256").update("capi-diagnostic@example.invalid").digest("hex")] },
      custom_data: { value: 14999, currency: "NGN", content_name: "CAPI DIAGNOSTIC TEST", content_ids: ["capi-diagnostic-test"], content_type: "product" },
    },
  ],
};

const url = new URL(`https://graph.facebook.com/${GRAPH}/${encodeURIComponent(PIXEL)}/events`);
url.searchParams.set("access_token", token);
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const text = (await res.text()).replaceAll(token, "[redacted]");
console.log(`pixel=${PIXEL} http=${res.status} event_id=${eventId}`);
console.log(text.slice(0, 600));
process.exit(res.ok ? 0 : 1);
