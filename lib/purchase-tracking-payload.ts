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
  /** Customer IP from the verified Paystack transaction, when Paystack returns one. */
  clientIpAddress?: string | null;
  /** Customer browser user agent, only when a real browser request supplies one. */
  clientUserAgent?: string | null;
};

/** Graph API version for Conversions API calls. v26.0 is current, v24.0 and v25.0 are supported. */
export const META_GRAPH_API_VERSION = "v25.0";

export function metaCapiEventsUrl(pixelId: string): string {
  return `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events`;
}

/**
 * Meta test event codes look like TEST12345. Accept letters, digits, dash and underscore only,
 * so a malformed env value never reaches the request body.
 */
export function normalizeMetaTestEventCode(raw?: string | null): string | undefined {
  const code = raw?.trim();
  if (!code) return undefined;
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : undefined;
}

/** Pixel-specific test code wins over the generic one. Both come from server env only. */
export function metaTestEventCodeEnvName(pixelId: string): string {
  return `META_TEST_EVENT_CODE_${pixelId.replace(/[^0-9A-Za-z]/g, "")}`;
}

/** Accepts IPv4 and IPv6 text. Anything else is dropped rather than sent. */
export function normalizeClientIp(raw?: string | null): string | undefined {
  const ip = raw?.trim();
  if (!ip || ip.length > 45) return undefined;
  return /^[0-9A-Fa-f:.]+$/.test(ip) ? ip : undefined;
}

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

export function buildMetaPurchaseEvent(
  ctx: MetaPurchaseContext,
  nowSeconds: number,
  testEventCode?: string | null,
) {
  const userData: Record<string, unknown> = {
    em: [sha256HexEmail(ctx.customerEmail)],
  };
  // Meta wants IP and user agent in clear text, never hashed.
  const ip = normalizeClientIp(ctx.clientIpAddress);
  if (ip) userData.client_ip_address = ip;
  const ua = ctx.clientUserAgent?.trim();
  if (ua) userData.client_user_agent = ua.slice(0, 500);

  const event: Record<string, unknown> = {
    event_name: "Purchase",
    event_time: nowSeconds,
    event_id: metaPurchaseEventId(ctx.reference),
    action_source: "website",
    user_data: userData,
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
  const body: { data: Record<string, unknown>[]; test_event_code?: string } = { data: [event] };
  const code = normalizeMetaTestEventCode(testEventCode);
  if (code) body.test_event_code = code;
  return body;
}
