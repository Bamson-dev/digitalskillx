import "server-only";
import crypto from "crypto";
import { runtimeEnv } from "@/lib/runtime-env";

const BASE = "https://api.paystack.co";

function secretKey() {
  const key = runtimeEnv("PAYSTACK_SECRET_KEY");
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

export function paystackConfigured() {
  return Boolean(runtimeEnv("PAYSTACK_SECRET_KEY")?.trim());
}

export function publicKey() {
  return runtimeEnv("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY") ?? "";
}

export type InitializeParams = {
  email: string;
  amountMinor: number;
  currency: "NGN" | "USD";
  reference: string;
  callbackUrl: string;
  metadata: Record<string, string>;
};

export async function initializeTransaction(params: InitializeParams) {
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountMinor,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
      currency: params.currency,
    }),
  });
  const json = await res.json();
  if (!json.status) {
    throw new Error(json.message ?? "Paystack initialization failed");
  }
  return json.data as {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

/** Verify Paystack webhook HMAC signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const hash = crypto.createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  return hash === signature;
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secretKey()}` },
  });
  const json = await res.json();
  if (!json.status) return null;
  return json.data as {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    metadata: Record<string, string>;
  };
}

export function generateReference() {
  return `dsx_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Set PAYSTACK_USD_ENABLED=true when your Paystack account supports USD settlement. */
export function paystackUsdEnabled() {
  return runtimeEnv("PAYSTACK_USD_ENABLED") === "true";
}
