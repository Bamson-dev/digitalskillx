import "server-only";
import crypto from "crypto";

export const CHECKOUT_REF_COOKIE = "dsx_checkout_ref";

/** Bind browser confirm to the checkout that started payment (guest + logged-in). */
export function checkoutRefCookieOptions(maxAgeSeconds = 60 * 60 * 6) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function hashCheckoutBinding(reference: string, email: string) {
  return crypto
    .createHash("sha256")
    .update(`${reference}:${email.trim().toLowerCase()}`)
    .digest("hex");
}
