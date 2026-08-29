/** Server-side Paystack Payment Page product catalog — never trust browser input. */

import type { VerifiedTransaction } from "@/lib/paystack";

export type PaystackExternalProduct = {
  key: string;
  title: string;
  titleAliases: readonly string[];
  defaultCourseId: string;
  expectedAmountKobo: number;
  expectedAmountNgn: number;
  currency: "NGN";
  paymentPageUrl: string;
  paymentPageSlug: string;
  successRedirectUrl: string;
};

export const BUILD_SOFTWARE_WITH_AI_PRODUCT: PaystackExternalProduct = {
  key: "build-software-with-ai",
  title: "Build And Monetize Your Software With AI",
  titleAliases: [
    "Build And Monetize Your Software With AI",
    "Build Software & Mobile Apps With AI",
    "How To Build Software With AI And Get Paid For It",
  ],
  defaultCourseId: "9818cf69-4158-40b5-8926-54a3be38f306",
  expectedAmountKobo: 4_999_900,
  expectedAmountNgn: 49_999,
  currency: "NGN",
  paymentPageUrl: "https://paystack.shop/pay/aiapp",
  paymentPageSlug: "aiapp",
  successRedirectUrl: "https://aimoneycode.com.ng/access-page-program/",
};

export const PAYSTACK_EXTERNAL_PRODUCTS: readonly PaystackExternalProduct[] = [
  BUILD_SOFTWARE_WITH_AI_PRODUCT,
];

export type PaystackChargePayload = {
  id?: number | string;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  customer?: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  plan?: { name?: string; plan_code?: string } | null;
  authorization?: { channel?: string } | null;
  channel?: string;
  paid_at?: string;
  gateway_response?: string;
  page?: { slug?: string; name?: string } | null;
};

function metadataString(meta: Record<string, unknown> | undefined, key: string): string | null {
  const raw = meta?.[key];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

function metadataMatchesProduct(meta: Record<string, unknown> | undefined, product: PaystackExternalProduct) {
  const productKey = metadataString(meta, "product_key") ?? metadataString(meta, "product");
  if (productKey && productKey.toLowerCase() === product.key) return true;
  if (productKey && productKey.toLowerCase() === "digitalskillx") return true;

  const paymentPage =
    metadataString(meta, "payment_page") ??
    metadataString(meta, "payment_page_slug") ??
    metadataString(meta, "page_slug");
  if (paymentPage && paymentPage.toLowerCase().includes(product.paymentPageSlug)) return true;

  const customFields = meta?.custom_fields;
  if (Array.isArray(customFields)) {
    for (const field of customFields) {
      if (!field || typeof field !== "object") continue;
      const row = field as { variable_name?: string; value?: string };
      const name = String(row.variable_name ?? "").toLowerCase();
      const value = String(row.value ?? "").toLowerCase();
      if (name.includes("product") && value.includes(product.key)) return true;
      if (value.includes(product.paymentPageSlug)) return true;
    }
  }

  return false;
}

function pageSlugFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("paystack.com") && !host.endsWith("paystack.shop")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const payIndex = parts.findIndex((part) => part.toLowerCase() === "pay");
    if (payIndex >= 0 && parts[payIndex + 1]) {
      return parts[payIndex + 1].toLowerCase();
    }
  } catch {
    return null;
  }
  return null;
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || value == null) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out.push(key);
      collectStrings(nested, out, depth + 1);
    }
  }
}

function hasPaymentPageIdentity(
  values: string[],
  product: PaystackExternalProduct,
): boolean {
  return values.some((value) => {
    const slug = pageSlugFromUrl(value);
    if (slug === product.paymentPageSlug) return true;
    return value.toLowerCase().includes(`pay/${product.paymentPageSlug}`);
  });
}

export function amountAndCurrencyMatchProduct(
  amount: number | undefined,
  currency: string | undefined,
  product: PaystackExternalProduct,
): boolean {
  return (
    amount === product.expectedAmountKobo &&
    String(currency ?? "NGN").toUpperCase() === product.currency
  );
}

export function identifyPaystackExternalProduct(input: {
  verified: Pick<VerifiedTransaction, "amount" | "currency" | "metadata" | "status">;
  webhookData?: PaystackChargePayload | null;
}): PaystackExternalProduct | null {
  if (input.verified.status !== "success") return null;

  for (const product of PAYSTACK_EXTERNAL_PRODUCTS) {
    if (!amountAndCurrencyMatchProduct(input.verified.amount, input.verified.currency, product)) {
      continue;
    }

    const meta = {
      ...(input.webhookData?.metadata ?? {}),
      ...(input.verified.metadata ?? {}),
    } as Record<string, unknown>;

    if (metadataMatchesProduct(meta, product)) return product;

    const pageSlug =
      input.webhookData?.page?.slug ??
      metadataString(meta, "page_slug") ??
      metadataString(meta, "slug");
    if (pageSlug && pageSlug.toLowerCase().includes(product.paymentPageSlug)) return product;

    const haystack: string[] = [];
    collectStrings(meta, haystack);
    if (
      hasPaymentPageIdentity(haystack, product) &&
      amountAndCurrencyMatchProduct(input.verified.amount, input.verified.currency, product)
    ) {
      return product;
    }
  }

  return null;
}

export function configuredExternalCourseId(product: PaystackExternalProduct): string {
  if (product.key === BUILD_SOFTWARE_WITH_AI_PRODUCT.key) {
    const override = process.env.PAYSTACK_AIAPP_COURSE_ID?.trim();
    if (override) return override;
  }
  return product.defaultCourseId;
}

export function resolveExternalProductByKey(productKey: string): PaystackExternalProduct | null {
  const normalized = productKey.trim().toLowerCase();
  return PAYSTACK_EXTERNAL_PRODUCTS.find((product) => product.key === normalized) ?? null;
}

export type ExternalFulfillmentStatus =
  | "payment_received"
  | "payment_verified"
  | "enrolled"
  | "email_sent"
  | "email_failed"
  | "fulfillment_failed";

export type ExternalPaystackData = {
  source: "paystack_payment_page" | "leadthur-paystack-router";
  product_key: string;
  payment_page: string;
  fulfillment_status: ExternalFulfillmentStatus;
  paystack_transaction_id?: string | number | null;
  webhook_event?: string;
  access_email_sent_at?: string | null;
  purchase_tracking_sent_at?: string | null;
  fulfillment_error?: string | null;
  paid_at?: string | null;
  customer_email?: string | null;
  leadthur_event_id?: string | null;
};

export function readExternalPaystackData(paystackData: unknown): ExternalPaystackData | null {
  if (!paystackData || typeof paystackData !== "object") return null;
  const row = paystackData as Partial<ExternalPaystackData>;
  if (row.source !== "paystack_payment_page" && row.source !== "leadthur-paystack-router") return null;
  if (!row.product_key || !row.fulfillment_status) return null;
  return row as ExternalPaystackData;
}
