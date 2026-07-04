import "server-only";
import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPaystackSecretKey, paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { runtimeEnv } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

const BASE = "https://api.paystack.co";

export async function paystackConfigured(supabase?: SupabaseClient<Database>) {
  return paystackSecretKeyConfigured(supabase);
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

export async function initializeTransaction(
  params: InitializeParams,
  supabase?: SupabaseClient<Database>,
) {
  const secret = await getPaystackSecretKey(supabase);
  const res = await fetch(`${BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
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
export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  supabase?: SupabaseClient<Database>,
) {
  if (!signature) return false;
  const secret = await getPaystackSecretKey(supabase);
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

export type VerifiedTransaction = {
  status: string;
  reference: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
};

export async function verifyTransaction(
  reference: string,
  supabase?: SupabaseClient<Database>,
): Promise<VerifiedTransaction | null> {
  const secret = await getPaystackSecretKey(supabase);
  const res = await fetch(`${BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const json = await res.json();
  if (!json.status) return null;
  return json.data as VerifiedTransaction;
}

export function generateReference() {
  return `dsx_${crypto.randomUUID().replace(/-/g, "")}`;
}

/** Set PAYSTACK_USD_ENABLED=true when your Paystack account supports USD settlement. */
export function paystackUsdEnabled() {
  return runtimeEnv("PAYSTACK_USD_ENABLED") === "true";
}
