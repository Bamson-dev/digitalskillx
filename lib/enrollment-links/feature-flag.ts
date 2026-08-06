import "server-only";
import { runtimeEnv } from "@/lib/runtime-env";

/**
 * Feature flag for the Enrollment Link product surface.
 * Existing purchase / admin / bulk / free / automation enroll paths are NOT gated —
 * they keep their production implementations until migrated one source at a time.
 *
 * Default: enabled when unset (opt-out via ENROLLMENT_LINKS_ENABLED=false).
 * Set ENROLLMENT_LINKS_ENABLED=false to hide admin UI + reject public redeem
 * without touching other enrollment methods.
 */
export function enrollmentLinksEnabled(): boolean {
  const raw = (
    process.env.ENROLLMENT_LINKS_ENABLED ??
    runtimeEnv("ENROLLMENT_LINKS_ENABLED") ??
    "true"
  )
    .trim()
    .toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}
