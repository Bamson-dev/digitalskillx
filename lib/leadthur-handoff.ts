import "server-only";
import crypto from "crypto";
import {
  BUILD_SOFTWARE_WITH_AI_PRODUCT,
  amountAndCurrencyMatchProduct,
  resolveExternalProductByKey,
  type PaystackExternalProduct,
} from "@/lib/paystack-external-products";

export const LEADTHUR_SIGNATURE_HEADER = "x-leadthur-signature";
export const LEADTHUR_TIMESTAMP_HEADER = "x-leadthur-timestamp";
export const LEADTHUR_NONCE_HEADER = "x-leadthur-nonce";
export const LEADTHUR_EVENT_ID_HEADER = "x-leadthur-event-id";
export const LEADTHUR_PRODUCT_HEADER = "x-leadthur-product-key";

export const LEADTHUR_MAX_CLOCK_SKEW_SECONDS = 300;
export const LEADTHUR_MIN_SECRET_LENGTH = 32;

export type LeadthurHandoffPayload = {
  event: "charge.success";
  source: "leadthur-paystack-router";
  product_key: string;
  course_id?: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  paid_at: string | null;
  customer: { email: string };
};

export type LeadthurHandoffHeaders = {
  signature: string;
  timestamp: string;
  nonce: string;
  eventId: string;
  productKey: string;
};

export type LeadthurAuthFailureReason =
  | "not_configured"
  | "missing_signature"
  | "malformed_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "stale_timestamp"
  | "missing_nonce"
  | "missing_event_id"
  | "missing_product_key"
  | "invalid_signature";

export function getLeadthurForwardSecret(): string {
  return process.env.DIGITALSKILLX_FORWARD_SECRET?.trim() ?? "";
}

export function isLeadthurForwardSecretConfigured(): boolean {
  return getLeadthurForwardSecret().length >= LEADTHUR_MIN_SECRET_LENGTH;
}

export function isLeadthurHandoffRequest(headers: {
  get(name: string): string | null;
}): boolean {
  return Boolean(headers.get(LEADTHUR_SIGNATURE_HEADER)?.trim());
}

export function buildLeadthurSignedMaterial(params: {
  timestamp: string;
  nonce: string;
  body: string;
}): string {
  return `${params.timestamp}.${params.nonce}.${params.body}`;
}

export function signLeadthurHandoffPayload(params: {
  secret: string;
  timestamp: string;
  nonce: string;
  body: string;
}): string {
  const signed = buildLeadthurSignedMaterial({
    timestamp: params.timestamp,
    nonce: params.nonce,
    body: params.body,
  });
  return crypto.createHmac("sha256", params.secret).update(signed).digest("hex");
}

/** Constant-time hex digest comparison. */
export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

export function parseLeadthurSignatureHeader(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  const match = /^sha256=([a-f0-9]{64})$/i.exec(trimmed);
  if (match) return match[1].toLowerCase();
  if (/^[a-f0-9]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}

export type ReadLeadthurHandoffHeadersResult =
  | ({ ok: true } & LeadthurHandoffHeaders)
  | { ok: false; reason: LeadthurAuthFailureReason };

export function readLeadthurHandoffHeaders(headers: {
  get(name: string): string | null;
}): ReadLeadthurHandoffHeadersResult {
  const signatureRaw = headers.get(LEADTHUR_SIGNATURE_HEADER);
  const signature = parseLeadthurSignatureHeader(signatureRaw);
  if (!signatureRaw?.trim()) return { ok: false, reason: "missing_signature" };
  if (!signature) return { ok: false, reason: "malformed_signature" };

  const timestamp = headers.get(LEADTHUR_TIMESTAMP_HEADER)?.trim() ?? "";
  if (!timestamp) return { ok: false, reason: "missing_timestamp" };

  const nonce = headers.get(LEADTHUR_NONCE_HEADER)?.trim() ?? "";
  if (!nonce) return { ok: false, reason: "missing_nonce" };

  const eventId = headers.get(LEADTHUR_EVENT_ID_HEADER)?.trim() ?? "";
  if (!eventId) return { ok: false, reason: "missing_event_id" };

  const productKey = headers.get(LEADTHUR_PRODUCT_HEADER)?.trim() ?? "";
  if (!productKey) return { ok: false, reason: "missing_product_key" };

  return { ok: true, signature, timestamp, nonce, eventId, productKey };
}

export function verifyLeadthurHandoffSignature(params: {
  secret: string;
  signature: string;
  timestamp: string;
  nonce: string;
  body: string;
  nowSeconds?: number;
  maxSkewSeconds?: number;
}):
  | { valid: true }
  | { valid: false; reason: LeadthurAuthFailureReason } {
  if (!params.secret || params.secret.length < LEADTHUR_MIN_SECRET_LENGTH) {
    return { valid: false, reason: "not_configured" };
  }

  const ts = Number(params.timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "invalid_timestamp" };
  }

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = Math.abs(now - ts);
  if (skew > (params.maxSkewSeconds ?? LEADTHUR_MAX_CLOCK_SKEW_SECONDS)) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const expected = signLeadthurHandoffPayload({
    secret: params.secret,
    timestamp: params.timestamp,
    nonce: params.nonce,
    body: params.body,
  });

  if (!safeEqualHex(expected, params.signature)) {
    return { valid: false, reason: "invalid_signature" };
  }

  return { valid: true };
}

export function parseLeadthurHandoffPayload(rawBody: string):
  | { ok: true; payload: LeadthurHandoffPayload }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "invalid_payload" };
  }

  const row = parsed as Partial<LeadthurHandoffPayload>;
  if (row.event !== "charge.success") return { ok: false, error: "invalid_event" };
  if (row.source !== "leadthur-paystack-router") return { ok: false, error: "invalid_source" };
  if (!row.product_key?.trim()) return { ok: false, error: "missing_product_key" };
  if (!row.reference?.trim()) return { ok: false, error: "missing_reference" };
  if (typeof row.amount !== "number" || !Number.isFinite(row.amount)) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!row.currency?.trim()) return { ok: false, error: "missing_currency" };
  if (!row.status?.trim()) return { ok: false, error: "missing_status" };
  if (!row.customer?.email?.trim()) return { ok: false, error: "missing_customer_email" };

  return {
    ok: true,
    payload: {
      event: "charge.success",
      source: "leadthur-paystack-router",
      product_key: row.product_key.trim(),
      course_id: row.course_id,
      reference: row.reference.trim(),
      amount: row.amount,
      currency: row.currency.trim().toUpperCase(),
      status: row.status.trim().toLowerCase(),
      paid_at: row.paid_at ?? null,
      customer: { email: row.customer.email.trim().toLowerCase() },
    },
  };
}

export function validateLeadthurHandoffPayment(params: {
  headerProductKey: string;
  payload: LeadthurHandoffPayload;
}):
  | { ok: true; product: PaystackExternalProduct }
  | { ok: false; reason: string } {
  if (params.headerProductKey.trim().toLowerCase() !== params.payload.product_key.trim().toLowerCase()) {
    return { ok: false, reason: "product_key_mismatch" };
  }

  const product = resolveExternalProductByKey(params.payload.product_key);
  if (!product) {
    return { ok: false, reason: "unknown_product_key" };
  }

  if (params.payload.status !== "success") {
    return { ok: false, reason: "payment_not_successful" };
  }

  if (!amountAndCurrencyMatchProduct(params.payload.amount, params.payload.currency, product)) {
    return { ok: false, reason: "amount_or_currency_mismatch" };
  }

  // Never trust course_id from the handoff body — only the catalog mapping is authoritative.
  if (
    params.payload.course_id &&
    params.payload.course_id !== product.defaultCourseId
  ) {
    return { ok: false, reason: "forged_course_id" };
  }

  return { ok: true, product };
}

export function buildLeadthurHandoffHeadersForTest(params: {
  secret: string;
  body: string;
  eventId: string;
  productKey?: string;
  nowSeconds?: number;
  nonce?: string;
}): Record<string, string> {
  const timestamp = String(params.nowSeconds ?? Math.floor(Date.now() / 1000));
  const nonce = params.nonce ?? crypto.randomUUID();
  const signature = signLeadthurHandoffPayload({
    secret: params.secret,
    timestamp,
    nonce,
    body: params.body,
  });
  const productKey = params.productKey ?? BUILD_SOFTWARE_WITH_AI_PRODUCT.key;

  return {
    [LEADTHUR_SIGNATURE_HEADER]: `sha256=${signature}`,
    [LEADTHUR_TIMESTAMP_HEADER]: timestamp,
    [LEADTHUR_NONCE_HEADER]: nonce,
    [LEADTHUR_EVENT_ID_HEADER]: params.eventId,
    [LEADTHUR_PRODUCT_HEADER]: productKey,
  };
}
