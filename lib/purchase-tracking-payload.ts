/**
 * Pure helpers for the server-side Meta Purchase event. No secrets, no network,
 * no "server-only" import, so the payload shape can be tested offline.
 */
import { createHash } from "node:crypto";

export type MetaPurchaseProduct = {
  key: string;
  title: string;
  expectedAmountNgn: number;
  currency: string;
  /** Pixel / dataset for this product. Falls back to the env default. */
  metaPixelId?: string;
  /** Page where the browser Purchase fires. Sent as event_source_url when set. */
  successRedirectUrl?: string;
};

export type MetaPurchaseContext = {
  reference: string;
  customerEmail: string;
  product: MetaPurchaseProduct;
};

/**
 * Browser and server must send the same event_id so Meta counts one Purchase.
 * The browser thank-you page uses the same format with the Paystack reference.
 */
export function metaPurchaseEventId(reference: string): string {
  return `purchase_${reference}`;
}

export function sha256HexEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function resolveMetaPixelId(
  product: Pick<MetaPurchaseProduct, "metaPixelId">,
  envPixelId?: string | null,
): string | undefined {
  const own = product.metaPixelId?.trim();
  if (own) return own;
  const fallback = envPixelId?.trim();
  return fallback || undefined;
}

/**
 * Env name for a pixel-specific Conversions API token. Meta access tokens are
 * issued per dataset, so a product with its own pixel needs its own token.
 */
export function metaCapiTokenEnvName(pixelId: string): string {
  return `META_CAPI_TOKEN_${pixelId.replace(/[^0-9A-Za-z]/g, "")}`;
}

export function buildMetaPurchaseEvent(ctx: MetaPurchaseContext, nowSeconds: number) {
  const event: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: nowSeconds,
    event_id: metaPurchaseEventId(ctx.reference),
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
  };
  if (ctx.product.successRedirectUrl) {
    event.event_source_url = ctx.product.successRedirectUrl;
  }
  return { data: [event] };
}
