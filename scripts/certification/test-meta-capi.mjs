#!/usr/bin/env node
/**
 * Meta Conversions API: payload, test event code, token handling, failure handling and
 * once-per-transaction recording. Offline. fetch is mocked, no network call is made.
 * Run: node --import ./scripts/certification/register-ts-ext.mjs scripts/certification/test-meta-capi.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ts = (rel) => pathToFileURL(join(root, rel)).href;
const read = (rel) => readFileSync(join(root, rel), "utf8");

const payload = await import(ts("lib/purchase-tracking-payload.ts"));
const tracking = await import(ts("lib/purchase-tracking.ts"));

const PIXEL = "1043090941844015";
const TOKEN_ENV = `META_CAPI_TOKEN_${PIXEL}`;
const FAKE_TOKEN = "TESTTOKEN_not_a_real_credential_0123456789";
const NOW = 1_800_000_000;
const ctx = (extra = {}) => ({
  reference: "ref_abc123",
  customerEmail: "  Buyer@Example.com ",
  product: {
    key: "ai-ads-automation-masterclass",
    title: "AI Ads Automation Masterclass",
    expectedAmountNgn: 14999,
    currency: "NGN",
    metaPixelId: PIXEL,
    successRedirectUrl: "https://aimoneycode.com.ng/ai-ad/thank-you/",
  },
  ...extra,
});

let passed = 0;
async function check(label, fn) {
  await fn();
  passed += 1;
  console.log(`PASS: ${label}`);
}

const ENV_KEYS = [TOKEN_ENV, "META_CAPI_TOKEN", "META_TEST_EVENT_CODE", `META_TEST_EVENT_CODE_${PIXEL}`, "META_PIXEL_ID", "STAPE_SERVER_URL"];
function resetEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

/** Run fn with fetch mocked. Returns the recorded calls. */
async function withFetch(responder, fn) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return responder(String(url), init);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = original;
  }
  return calls;
}
const okResponse = () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 });

await check("M1. Purchase payload: name, time, id, source, value, currency, content IDs, URL", () => {
  const { data } = payload.buildMetaPurchaseEvent(ctx(), NOW);
  const e = data[0];
  assert.equal(e.event_name, "Purchase");
  assert.equal(e.event_time, NOW);
  assert.equal(e.event_id, "purchase_ref_abc123");
  assert.equal(e.action_source, "website");
  assert.equal(e.event_source_url, "https://aimoneycode.com.ng/ai-ad/thank-you/");
  assert.equal(e.custom_data.value, 14999);
  assert.equal(e.custom_data.currency, "NGN");
  assert.deepEqual(e.custom_data.content_ids, ["ai-ads-automation-masterclass"]);
});

await check("M2. email is trimmed, lowercased and SHA-256 hashed", () => {
  const { data } = payload.buildMetaPurchaseEvent(ctx(), NOW);
  const expected = crypto.createHash("sha256").update("buyer@example.com").digest("hex");
  assert.deepEqual(data[0].user_data.em, [expected]);
  assert.ok(!JSON.stringify(data).toLowerCase().includes("buyer@example.com"));
});

await check("M3. client IP is sent in clear text when valid, dropped when malformed, never invented", () => {
  const withIp = payload.buildMetaPurchaseEvent(ctx({ clientIpAddress: "102.89.1.20" }), NOW).data[0].user_data;
  assert.equal(withIp.client_ip_address, "102.89.1.20");
  const v6 = payload.buildMetaPurchaseEvent(ctx({ clientIpAddress: "2001:db8::1" }), NOW).data[0].user_data;
  assert.equal(v6.client_ip_address, "2001:db8::1");
  const bad = payload.buildMetaPurchaseEvent(ctx({ clientIpAddress: "1.2.3.4, <script>" }), NOW).data[0].user_data;
  assert.equal(bad.client_ip_address, undefined);
  const none = payload.buildMetaPurchaseEvent(ctx(), NOW).data[0].user_data;
  assert.equal(none.client_ip_address, undefined);
  assert.equal(none.client_user_agent, undefined);
});

await check("M4. test_event_code is added only when valid and configured", () => {
  assert.equal(payload.buildMetaPurchaseEvent(ctx(), NOW).test_event_code, undefined);
  assert.equal(payload.buildMetaPurchaseEvent(ctx(), NOW, "").test_event_code, undefined);
  assert.equal(payload.buildMetaPurchaseEvent(ctx(), NOW, "TEST12345").test_event_code, "TEST12345");
  assert.equal(payload.buildMetaPurchaseEvent(ctx(), NOW, "bad code; drop").test_event_code, undefined);
  assert.equal(payload.metaTestEventCodeEnvName(PIXEL), `META_TEST_EVENT_CODE_${PIXEL}`);
});

await check("M5. Graph API version is a supported version, not v19", () => {
  assert.match(payload.META_GRAPH_API_VERSION, /^v(24|25|26)\.0$/);
  assert.equal(payload.metaCapiEventsUrl(PIXEL), `https://graph.facebook.com/${payload.META_GRAPH_API_VERSION}/${PIXEL}/events`);
});

await check("M6. missing token: no Meta call, outcome skipped, no error", async () => {
  resetEnv();
  const calls = await withFetch(okResponse, async () => {
    const out = await tracking.trackExternalPurchase(ctx());
    assert.equal(out.meta, "skipped");
    assert.deepEqual(out.errors, []);
  });
  assert.equal(calls.filter((c) => c.url.includes("graph.facebook.com")).length, 0);
});

await check("M7. configured token: one call to the pixel endpoint, outcome sent", async () => {
  resetEnv();
  process.env[TOKEN_ENV] = FAKE_TOKEN;
  const calls = await withFetch(okResponse, async () => {
    const out = await tracking.trackExternalPurchase(ctx());
    assert.equal(out.meta, "sent");
  });
  const meta = calls.filter((c) => c.url.includes("graph.facebook.com"));
  assert.equal(meta.length, 1);
  assert.ok(meta[0].url.includes(`/${PIXEL}/events`));
  const body = JSON.parse(meta[0].init.body);
  assert.equal(body.data[0].event_id, "purchase_ref_abc123");
  assert.equal(body.test_event_code, undefined, "no test code unless configured");
  resetEnv();
});

await check("M8. test event code from server env reaches the request body", async () => {
  resetEnv();
  process.env[TOKEN_ENV] = FAKE_TOKEN;
  process.env.META_TEST_EVENT_CODE = "TEST777";
  const calls = await withFetch(okResponse, async () => {
    await tracking.trackExternalPurchase(ctx());
  });
  const body = JSON.parse(calls.find((c) => c.url.includes("graph.facebook.com")).init.body);
  assert.equal(body.test_event_code, "TEST777");
  resetEnv();
});

await check("M9. Meta API failure: outcome failed, error recorded, token never in the error", async () => {
  resetEnv();
  process.env[TOKEN_ENV] = FAKE_TOKEN;
  await withFetch(
    () => new Response(`Invalid token ${FAKE_TOKEN} rejected`, { status: 400 }),
    async () => {
      const out = await tracking.trackExternalPurchase(ctx());
      assert.equal(out.meta, "failed");
      assert.ok(out.errors.length >= 1);
      assert.ok(!JSON.stringify(out).includes(FAKE_TOKEN), "token must be redacted");
    },
  );
  resetEnv();
});

await check("M10. network error never throws out of trackExternalPurchase", async () => {
  resetEnv();
  process.env[TOKEN_ENV] = FAKE_TOKEN;
  await withFetch(
    () => {
      throw new Error("socket hang up");
    },
    async () => {
      const out = await tracking.trackExternalPurchase(ctx());
      assert.equal(out.meta, "failed");
    },
  );
  resetEnv();
});

await check("M11. fulfilment records purchase tracking only when Meta accepted the event", () => {
  const src = read("lib/paystack-external-fulfillment.ts");
  assert.match(src, /tracking\.meta === "sent"/);
  assert.match(src, /externalMeta\?\.purchase_tracking_sent_at\) return/, "once per transaction");
  const gate = src.indexOf("if (emailResult.sent) {");
  const track = src.lastIndexOf("await trackPurchaseOnce({");
  const verify = src.indexOf('verified.status !== "success"');
  assert.ok(verify > -1 && gate > verify && track > gate, "tracking only after verified payment and access email");
});

await check("M12. token and test code stay server-side", () => {
  const tracking = read("lib/purchase-tracking.ts");
  assert.ok(tracking.startsWith('import "server-only"'));
  assert.ok(!/NEXT_PUBLIC_META_CAPI|NEXT_PUBLIC_META_TEST/.test(read("lib/purchase-tracking-payload.ts") + tracking));
  assert.ok(!/EAA[A-Za-z0-9]{20,}/.test(tracking));
  assert.ok(!/secureLog\([^)]*token/i.test(tracking.replace(/meta_capi_skipped[\s\S]*?\}\);/, "")), "token not logged");
});

console.log(`\nPASS: Meta Conversions API checks (${passed} checks)`);
