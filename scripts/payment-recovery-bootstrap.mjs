#!/usr/bin/env node
/**
 * Keeps the Resend webhook for payment recovery present and enabled.
 * The signing secret is fetched at startup and passed only to the app process.
 *
 * Key split: webhook management (list/get/create/patch) authenticates with
 * RESEND_WEBHOOK_API_KEY (a Full access key) when it is set, because
 * Sending-access keys cannot manage webhooks and Resend returns HTTP 401.
 * When RESEND_WEBHOOK_API_KEY is not set it falls back to RESEND_API_KEY,
 * which remains the only key used for sending email anywhere in the app.
 */

export const RESEND_RECOVERY_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.suppressed",
];

const RESEND_API = "https://api.resend.com";

/**
 * Resolve the key used for webhook management calls only.
 * RESEND_WEBHOOK_API_KEY (Full access) wins when set; otherwise the
 * sending key RESEND_API_KEY is used, preserving the previous behaviour.
 * This key is never used to send email.
 */
export function resolveResendWebhookApiKey(env = process.env) {
  const webhookKey = typeof env?.RESEND_WEBHOOK_API_KEY === "string" ? env.RESEND_WEBHOOK_API_KEY.trim() : "";
  if (webhookKey) return webhookKey;
  return typeof env?.RESEND_API_KEY === "string" ? env.RESEND_API_KEY.trim() : "";
}

async function request(path, { apiKey, method = "GET", body, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(new URL(path, RESEND_API), {
      method,
      headers: {
        Authorization: "Bearer " + apiKey,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Resend webhook API returned HTTP " + response.status);
    }
    if (response.status === 204) return {};
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function findWebhook(endpoint, options) {
  let after = "";
  for (let page = 0; page < 20; page += 1) {
    const query = new URLSearchParams({ limit: "100" });
    if (after) query.set("after", after);
    const result = await request("/webhooks?" + query.toString(), options);
    const items = Array.isArray(result?.data) ? result.data : [];
    const match = items.find((item) => item?.endpoint === endpoint);
    if (match) return match;
    if (!result?.has_more || items.length === 0) return null;
    const next = items[items.length - 1]?.id;
    if (!next || next === after) throw new Error("Resend webhook pagination returned an invalid cursor");
    after = next;
  }
  throw new Error("Resend webhook list exceeded the safe pagination limit");
}

/**
 * Create or reconcile the webhook. Existing subscriptions are preserved.
 * Never rotates the signing secret as part of routine startup.
 */
export async function ensureResendRecoveryWebhook({
  apiKey,
  webhookApiKey,
  endpoint = "https://www.digitalskillx.com/api/webhooks/resend",
  fetchImpl = fetch,
}) {
  // Webhook management prefers the dedicated Full access key; the sending
  // key is only a fallback for deployments that have not split the keys yet.
  const resolvedApiKey =
    (typeof webhookApiKey === "string" && webhookApiKey.trim()) ||
    (typeof apiKey === "string" ? apiKey.trim() : "");
  if (!resolvedApiKey) throw new Error("RESEND_API_KEY is required");
  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== "https:") throw new Error("Resend webhook endpoint must use HTTPS");

  const options = { apiKey: resolvedApiKey, fetchImpl };
  let listed = await findWebhook(endpoint, options);
  let created = false;
  let createdSecret = "";

  if (!listed) {
    const result = await request("/webhooks", {
      ...options,
      method: "POST",
      body: { endpoint, events: RESEND_RECOVERY_EVENTS },
    });
    if (!result?.id) throw new Error("Resend did not return a webhook ID");
    listed = { id: result.id };
    created = true;
    createdSecret = typeof result.signing_secret === "string" ? result.signing_secret : "";
  }

  let details = await request("/webhooks/" + encodeURIComponent(listed.id), options);
  let signingSecret = details?.signing_secret || createdSecret || listed?.signing_secret;
  const currentEvents = Array.isArray(details?.events) ? details.events : [];
  const mergedEvents = [...new Set([...currentEvents, ...RESEND_RECOVERY_EVENTS])];
  const needsUpdate =
    details?.status !== "enabled" ||
    RESEND_RECOVERY_EVENTS.some((event) => !currentEvents.includes(event));

  if (needsUpdate) {
    await request("/webhooks/" + encodeURIComponent(listed.id), {
      ...options,
      method: "PATCH",
      body: { endpoint, events: mergedEvents, status: "enabled" },
    });
    details = await request("/webhooks/" + encodeURIComponent(listed.id), options);
    signingSecret = details?.signing_secret || signingSecret || listed?.signing_secret;
  }

  if (typeof signingSecret !== "string" || !signingSecret.startsWith("whsec_")) {
    throw new Error("Resend webhook signing secret was not available");
  }
  if (details?.status && details.status !== "enabled") {
    throw new Error("Resend webhook is not enabled");
  }
  return { id: listed.id, signingSecret, created, endpoint };
}
