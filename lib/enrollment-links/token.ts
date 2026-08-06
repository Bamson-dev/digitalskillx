import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Generate a public enrollment-link token: el_ + 256-bit base64url (≥40 chars). */
export function generateEnrollmentLinkToken(): string {
  return `el_${randomBytes(32).toString("base64url")}`;
}

export function hashEnrollmentLinkToken(plaintext: string): string {
  return createHash("sha256").update(plaintext.trim()).digest("hex");
}

export function enrollmentLinkTokenPrefix(plaintext: string): string {
  const raw = plaintext.trim();
  if (raw.startsWith("el_")) return raw.slice(0, 11);
  return raw.slice(0, 8);
}
