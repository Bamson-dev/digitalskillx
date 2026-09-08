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
  /** Canonical Paystack shop slug (path after /pay/). */
  paymentPageSlug: string;
  /** Alternate shop slugs that fulfill the same course. */
  paymentPageSlugAliases: readonly string[];
  successRedirectUrl: string;
};

export const BUILD_SOFTWARE_WITH_AI_PRODUCT: PaystackExternalProduct = {
  key: "build-software-with-ai",
  title: "Build And Monetize Your Software With AI",
  titleAliases: [
    "Build And Monetize Your Software With AI",
    "Build and monetize app with AI",
    "Build, Launch & Monetize Mobile Apps With AI",
    "Build Software & Mobile Apps With AI",
    "How To Build Software With AI And Get Paid For It",
  ],
  defaultCourseId: "9818cf69-4158-40b5-8926-54a3be38f306",
  expectedAmountKobo: 1_499_900,
  expectedAmountNgn: 14_999,
  currency: "NGN",
  // Live Paystack shop link used in ads / webinars.
  paymentPageUrl: "https://paystack.shop/pay/ai-app",
  paymentPageSlug: "ai-app",
  paymentPageSlugAliases: ["ai-app", "aiapp"],
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

function productSlugs(product: PaystackExternalProduct): string[] {
  const slugs = [product.paymentPageSlug, ...product.paymentPageSlugAliases];
  return [...new Set(slugs.map((s) => s.toLowerCase()))];
}

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
  const slugs = productSlugs(product);
  if (paymentPage) {
    const page = paymentPage.toLowerCase();
    if (slugs.some((slug) => page === slug || page.includes(slug))) return true;
  }

  const customFields = meta?.custom_fields;
  if (Array.isArray(customFields)) {
    for (const field of customFields) {
      if (!field || typeof field !== "object") continue;
      const row = field as { variable_name?: string; value?: string };
      const name = String(row.variable_name ?? "").toLowerCase();
      const value = String(row.value ?? "").toLowerCase();
      if (name.includes("product") && value.includes(product.key)) return true;
      if (slugs.some((slug) => value.includes(slug))) return true;
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
  const slugs = productSlugs(product);
  return values.some((value) => {
    const slug = pageSlugFromUrl(value);
    if (slug && slugs.includes(slug)) return true;
    const lower = value.toLowerCase();
    return slugs.some((s) => lower.includes(`pay/${s}`));
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

function metadataClaimsForeignProduct(
  meta: Record<string, unknown> | undefined,
  product: PaystackExternalProduct,
): boolean {
  const markers = [
    metadataString(meta, "product_key"),
    metadataString(meta, "product"),
    metadataString(meta, "source"),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  for (const normalized of markers) {
    if (
      normalized === product.key ||
      normalized === "digitalskillx" ||
      normalized === "paystack_payment_page" ||
      normalized.includes("ai-app") ||
      normalized.includes("aiapp") ||
      normalized.includes("build-software")
    ) {
      continue;
    }
    if (
      normalized.includes("leadthur") ||
      normalized.includes("leadrush") ||
      normalized.includes("lead_thur")
    ) {
      return true;
    }
    // Explicit product_key pointing at a different catalog key.
    const explicitKey = metadataString(meta, "product_key")?.toLowerCase();
    if (explicitKey && explicitKey === normalized && explicitKey !== product.key) {
      return true;
    }
  }
  return false;
}

function titleAliasMatch(values: string[], product: PaystackExternalProduct): boolean {
  const aliases = product.titleAliases.map((a) => a.toLowerCase());
  const title = product.title.toLowerCase();
  return values.some((value) => {
    const lower = value.toLowerCase();
    if (lower.includes(title)) return true;
    return aliases.some((alias) => alias.length >= 12 && lower.includes(alias));
  });
}

/**
 * Identify a Payment Page / shop charge for DigitalSkillX enrollment.
 *
 * Paystack shop webhooks often omit `page.slug` and useful metadata. When the
 * paid amount+currency uniquely matches one catalog product (and metadata does
 * not claim a foreign product), accept that product so buyers get access+email.
 */
export function identifyPaystackExternalProduct(input: {
  verified: Pick<VerifiedTransaction, "amount" | "currency" | "metadata" | "status"> & {
    page?: { slug?: string; name?: string } | null;
    plan?: { name?: string; plan_code?: string } | null;
  };
  webhookData?: PaystackChargePayload | null;
}): PaystackExternalProduct | null {
  if (input.verified.status !== "success") return null;

  const amountMatches = PAYSTACK_EXTERNAL_PRODUCTS.filter((product) =>
    amountAndCurrencyMatchProduct(input.verified.amount, input.verified.currency, product),
  );
  if (amountMatches.length === 0) return null;

  const meta = {
    ...(input.webhookData?.metadata ?? {}),
    ...(input.verified.metadata ?? {}),
  } as Record<string, unknown>;

  for (const product of amountMatches) {
    if (metadataClaimsForeignProduct(meta, product)) continue;

    if (metadataMatchesProduct(meta, product)) return product;

    const pageSlug =
      input.webhookData?.page?.slug ??
      input.verified.page?.slug ??
      metadataString(meta, "page_slug") ??
      metadataString(meta, "slug");
    if (pageSlug) {
      const normalized = pageSlug.toLowerCase();
      if (productSlugs(product).some((slug) => normalized === slug || normalized.includes(slug))) {
        return product;
      }
    }

    const haystack: string[] = [];
    collectStrings(meta, haystack);
    collectStrings(input.webhookData ?? {}, haystack);
    collectStrings(
      {
        page: input.verified.page ?? input.webhookData?.page ?? null,
        plan: input.verified.plan ?? input.webhookData?.plan ?? null,
      },
      haystack,
    );
    if (hasPaymentPageIdentity(haystack, product)) return product;
    if (titleAliasMatch(haystack, product)) return product;
  }

  // Unique amount+currency fallback for Payment Pages that send bare charge payloads.
  if (amountMatches.length === 1) {
    const product = amountMatches[0];
    if (!metadataClaimsForeignProduct(meta, product)) {
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
