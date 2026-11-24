#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureResendRecoveryWebhook, RESEND_RECOVERY_EVENTS } from "../payment-recovery-bootstrap.mjs";

const root = resolve(import.meta.dirname, "../..");
const endpoint = "https://www.digitalskillx.com/api/webhooks/resend";
const signingSecret = "whsec_test-signing-secret";

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function test(name, fn) {
  await fn();
  console.log("ok  " + name);
}

await test("existing Resend webhook is enabled and required events are added without removing other subscriptions", async () => {
  const calls = [];
  let details = {
    id: "webhook_existing",
    endpoint,
    status: "disabled",
    events: ["email.sent", "email.received"],
    signing_secret: signingSecret,
  };

  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method || "GET";
    calls.push({ path: parsed.pathname, method, body: init.body ? JSON.parse(init.body) : null });
    if (parsed.pathname === "/webhooks" && method === "GET") {
      return response({ data: [{ id: details.id, endpoint }], has_more: false });
    }
    if (parsed.pathname === "/webhooks/" + details.id && method === "GET") {
      return response(details);
    }
    if (parsed.pathname === "/webhooks/" + details.id && method === "PATCH") {
      const patch = JSON.parse(init.body);
      details = { ...details, ...patch };
      return response({ id: details.id, endpoint, status: details.status, events: details.events });
    }
    throw new Error("Unexpected Resend API request: " + method + " " + parsed.pathname);
  };

  const result = await ensureResendRecoveryWebhook({ apiKey: "re_test_key", endpoint, fetchImpl });
  assert.equal(result.id, "webhook_existing");
  assert.equal(result.signingSecret, signingSecret);
  assert.equal(result.created, false);
  assert.equal(details.status, "enabled");
  for (const event of RESEND_RECOVERY_EVENTS) assert.ok(details.events.includes(event), "missing " + event);
  assert.ok(details.events.includes("email.received"), "existing event subscriptions must be preserved");
  assert.ok(calls.some((call) => call.method === "PATCH"));
});

await test("missing Resend webhook is created and its returned signing secret is retained", async () => {
  const calls = [];
  const createdId = "webhook_new";
  const fetchImpl = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method || "GET";
    calls.push({ path: parsed.pathname, method, body: init.body ? JSON.parse(init.body) : null });
    if (parsed.pathname === "/webhooks" && method === "GET") {
      return response({ data: [], has_more: false });
    }
    if (parsed.pathname === "/webhooks" && method === "POST") {
      const body = JSON.parse(init.body);
      assert.equal(body.endpoint, endpoint);
      assert.deepEqual(body.events, RESEND_RECOVERY_EVENTS);
      return response({ id: createdId, signing_secret: signingSecret });
    }
    if (parsed.pathname === "/webhooks/" + createdId && method === "GET") {
      return response({
        id: createdId,
        endpoint,
        status: "enabled",
        events: RESEND_RECOVERY_EVENTS,
      });
    }
    throw new Error("Unexpected Resend API request: " + method + " " + parsed.pathname);
  };

  const result = await ensureResendRecoveryWebhook({ apiKey: "re_test_key", endpoint, fetchImpl });
  assert.equal(result.id, createdId);
  assert.equal(result.signingSecret, signingSecret);
  assert.equal(result.created, true);
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
});

await test("missing API key and non-HTTPS webhook URLs fail closed", async () => {
  await assert.rejects(
    () => ensureResendRecoveryWebhook({ apiKey: "", endpoint }),
    /RESEND_API_KEY is required/,
  );
  await assert.rejects(
    () => ensureResendRecoveryWebhook({ apiKey: "re_test_key", endpoint: "http://localhost/webhook" }),
    /must use HTTPS/,
  );
});

const start = readFileSync(resolve(root, "scripts/start.mjs"), "utf8");
const scheduler = readFileSync(resolve(root, "scripts/payment-recovery-scheduler.mjs"), "utf8");
const docker = readFileSync(resolve(root, "Dockerfile"), "utf8");
const workflow = readFileSync(resolve(root, ".github/workflows/production-release.yml"), "utf8");
const plan = JSON.parse(readFileSync(resolve(root, "ops/coolify-cron-tasks.json"), "utf8"));

assert.match(start, /scripts\/db-migrate\.mjs/);
assert.match(start, /ensureResendRecoveryWebhook/);
assert.match(start, /PAYMENT_RECOVERY_FORCE_DISABLED/);
assert.match(start, /PAYMENT_RECOVERY_ENABLED = "true"/);
assert.match(start, /payment-recovery-scheduler\.mjs/);
assert.match(scheduler, /pg_try_advisory_lock/);
assert.match(scheduler, /\/api\/cron\/payment-recovery/);
assert.match(docker, /payment-recovery-bootstrap\.mjs/);
assert.match(docker, /payment-recovery-scheduler\.mjs/);
assert.match(workflow, /workflow_dispatch:/);
assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
assert.doesNotMatch(workflow, /github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
assert.equal(plan.required_manual_tasks, undefined);
assert.match(plan.description, /inside the application container/);

console.log("ok  automatic startup migrations, Resend setup, scheduler, Docker image and manual deployment controls");
console.log("payment recovery setup tests passed");
