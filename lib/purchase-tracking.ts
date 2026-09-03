import "server-only";
import { createHash } from "node:crypto";
import { runtimeEnv } from "@/lib/runtime-env";
import { secureLog } from "@/lib/secure-log";
import type { PaystackExternalProduct } from "@/lib/paystack-external-products";

export type PurchaseTrackingContext = {
  reference: string;
  customerEmail: string;
  product: Pick<PaystackExternalProduct, "key" | "title" | "expectedAmountNgn" | "currency">;
};

function stapeServerUrl(): string | undefined {
  return runtimeEnv("STAPE_SERVER_URL")?.replace(/\/$/, "");
}

function metaPixelId(): string | undefined {
  return runtimeEnv("META_PIXEL_ID");
}

function metaCapiToken(): string | undefined {
  return runtimeEnv("META_CAPI_TOKEN");
}

function sha256HexEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

async function sendStapeGa4Purchase(ctx: PurchaseTrackingContext): Promise<void> {
  const baseUrl = stapeServerUrl();
  if (!baseUrl) {
    secureLog("warn", "purchase-tracking", "stape_skipped", { reason: "STAPE_SERVER_URL missing" });
    return;
  }

  const collectUrl = `${baseUrl}/g/collect`;

  const payload = {
    client_id: ctx.customerEmail.trim().toLowerCase(),
    events: [
      {
        name: "purchase",
        params: {
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
  const pixelId = metaPixelId();
  const token = metaCapiToken();
  if (!pixelId || !token) {
    secureLog("warn", "purchase-tracking", "meta_capi_skipped", {
      reason: "META_PIXEL_ID or META_CAPI_TOKEN missing",
    });
    return;
  }

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `purchase_${ctx.reference}`,
        action_source: "website",
        user_data: {
          em: [sha256HexEmail(ctx.customerEmail)],
        },
        custom_data: {
          value: ctx.product.expectedAmountNgn,
          currency: ctx.product.currency,
          content_name: ctx.product.title,
          content_ids: [ctx.product.key],
          content_type: "product",
        },
      },
    ],
  };

  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events`);
  url.searchParams.set("access_token", token);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Meta CAPI failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export type PurchaseTrackingOutcome = {
  stape: "sent" | "skipped" | "failed";
  meta: "sent" | "skipped" | "failed";
  errors: string[];
};

/** Fire Stape GA4 + Meta CAPI purchase events. Fail-open — never throws. */
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
    if (!metaPixelId() || !metaCapiToken()) {
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
