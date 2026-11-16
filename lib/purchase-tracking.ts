import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";
import { secureLog } from "@/lib/secure-log";
import type { PaystackExternalProduct } from "@/lib/paystack-external-products";
import {
  buildMetaPurchaseEvent,
  metaCapiEventsUrl,
  metaCapiTokenEnvName,
  metaTestEventCodeEnvName,
  normalizeMetaTestEventCode,
  resolveMetaPixelId,
} from "@/lib/purchase-tracking-payload";

export type PurchaseTrackingContext = {
  reference: string;
  customerEmail: string;
  clientIpAddress?: string | null;
  clientUserAgent?: string | null;
  product: Pick<
    PaystackExternalProduct,
    "key" | "title" | "expectedAmountNgn" | "currency" | "metaPixelId" | "successRedirectUrl"
  >;
};

function stapeServerUrl(): string | undefined {
  return runtimeEnv("STAPE_SERVER_URL")?.replace(/\/$/, "");
}

/** Product pixel when the product has one, otherwise the env default (ai-app). */
function metaPixelId(ctx: PurchaseTrackingContext): string | undefined {
  return resolveMetaPixelId(ctx.product, runtimeEnv("META_PIXEL_ID"));
}

/** A pixel-specific token wins. The generic token only serves the default pixel. */
function metaCapiToken(ctx: PurchaseTrackingContext): string | undefined {
  const pixelId = metaPixelId(ctx);
  if (pixelId) {
    const specific = runtimeEnv(metaCapiTokenEnvName(pixelId));
    if (specific) return specific;
  }
  return runtimeEnv("META_CAPI_TOKEN");
}

/** Test code from server env only. Set it only while checking Events Manager, then remove it. */
function metaTestEventCode(ctx: PurchaseTrackingContext): string | undefined {
  const pixelId = metaPixelId(ctx);
  const specific = pixelId ? runtimeEnv(metaTestEventCodeEnvName(pixelId)) : undefined;
  return normalizeMetaTestEventCode(specific ?? runtimeEnv("META_TEST_EVENT_CODE"));
}

async function sendStapeGa4Purchase(ctx: PurchaseTrackingContext): Promise<void> {
  const baseUrl = stapeServerUrl();
  if (!baseUrl) {
    secureLog("warn", "purchase-tracking", "stape_skipped", { reason: "STAPE_SERVER_URL missing" });
    return;
  }

  // Stape sGTM Data Client — /g/collect rejects JSON Measurement Protocol bodies (400).
  const collectUrl = `${baseUrl}/data`;
  const email = ctx.customerEmail.trim().toLowerCase();

  const payload = {
    event_name: "purchase",
    event: "purchase_stape",
    transaction_id: ctx.reference,
    value: ctx.product.expectedAmountNgn,
    currency: ctx.product.currency,
    email,
    user_data: { email },
    ecommerce: {
      transaction_id: ctx.reference,
      value: ctx.product.expectedAmountNgn,
      currency: ctx.product.currency,
      items: [
        {
          item_id: ctx.product.key,
          item_name: ctx.product.title,
          price: ctx.product.expectedAmountNgn,
          quantity: 1,
        },
      ],
    },
    items: [
      {
        item_id: ctx.product.key,
        item_name: ctx.product.title,
        price: ctx.product.expectedAmountNgn,
        quantity: 1,
      },
    ],
  };

  const response = await fetch(collectUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Stape collect failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

async function sendMetaCapiPurchase(ctx: PurchaseTrackingContext): Promise<void> {
  const pixelId = metaPixelId(ctx);
  const token = metaCapiToken(ctx);
  if (!pixelId || !token) {
    secureLog("warn", "purchase-tracking", "meta_capi_skipped", {
      reason: "Meta pixel ID or CAPI token missing",
      productKey: ctx.product.key,
    });
    return;
  }

  const testCode = metaTestEventCode(ctx);
  if (testCode) {
    secureLog("warn", "purchase-tracking", "meta_capi_test_mode", {
      reference: ctx.reference,
      reason: "Test event code is set. Events appear in Test Events only.",
    });
  }
  const payload = buildMetaPurchaseEvent(ctx, Math.floor(Date.now() / 1000), testCode);

  // Meta's documented form. The URL is never logged, and error text is redacted below.
  const url = new URL(metaCapiEventsUrl(pixelId));
  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Meta CAPI failed (${response.status}): ${detail.replaceAll(token, "[redacted]").slice(0, 200)}`);
  }
}

export type PurchaseTrackingOutcome = {
  stape: "sent" | "skipped" | "failed";
  meta: "sent" | "skipped" | "failed";
  errors: string[];
};

/** Fire Stape GA4 + Meta CAPI (graph.facebook.com) purchase events. Fail-open — never throws. */
export async function trackExternalPurchase(
  ctx: PurchaseTrackingContext,
): Promise<PurchaseTrackingOutcome> {
  const outcome: PurchaseTrackingOutcome = { stape: "sent", meta: "sent", errors: [] };

  try {
    await sendStapeGa4Purchase(ctx);
    if (!stapeServerUrl()) {
      outcome.stape = "skipped";
    } else {
      secureLog("info", "purchase-tracking", "stape_purchase_sent", { reference: ctx.reference });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    outcome.stape = "failed";
    outcome.errors.push(`Stape: ${error}`);
    secureLog("warn", "purchase-tracking", "stape_purchase_failed", {
      reference: ctx.reference,
      error,
    });
  }

  try {
    await sendMetaCapiPurchase(ctx);
    if (!metaPixelId(ctx) || !metaCapiToken(ctx)) {
      outcome.meta = "skipped";
    } else {
      secureLog("info", "purchase-tracking", "meta_capi_purchase_sent", { reference: ctx.reference });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    outcome.meta = "failed";
    outcome.errors.push(`Meta CAPI: ${error}`);
    secureLog("warn", "purchase-tracking", "meta_capi_purchase_failed", {
      reference: ctx.reference,
      error,
    });
  }

  return outcome;
}
