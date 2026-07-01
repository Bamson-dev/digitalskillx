import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 100;

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSec?: number;
};

async function readBucket(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const { data: row } = await admin
      .from("rate_limit_buckets")
      .select("request_count, window_start")
      .eq("bucket_key", key)
      .maybeSingle();

    if (!row) return { ok: true, remaining: limit };

    const elapsed = now - new Date(row.window_start).getTime();
    if (elapsed > windowMs) return { ok: true, remaining: limit };

    if (row.request_count >= limit) {
      return { ok: false, remaining: 0, retryAfterSec: Math.ceil((windowMs - elapsed) / 1000) };
    }
    return { ok: true, remaining: limit - row.request_count };
  } catch {
    return { ok: true, remaining: limit };
  }
}

/**
 * Sliding-window rate limit backed by Postgres (serverless-safe).
 * Returns ok=false when the limit is exceeded.
 */
export async function rateLimit(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = WINDOW_MS,
): Promise<RateLimitResult> {
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const { data: row } = await admin
      .from("rate_limit_buckets")
      .select("request_count, window_start")
      .eq("bucket_key", key)
      .maybeSingle();

    if (!row) {
      await admin.from("rate_limit_buckets").upsert({
        bucket_key: key,
        request_count: 1,
        window_start: new Date(now).toISOString(),
      });
      return { ok: true, remaining: limit - 1 };
    }

    const windowStart = new Date(row.window_start).getTime();
    const elapsed = now - windowStart;

    if (elapsed > windowMs) {
      await admin
        .from("rate_limit_buckets")
        .update({ request_count: 1, window_start: new Date(now).toISOString() })
        .eq("bucket_key", key);
      return { ok: true, remaining: limit - 1 };
    }

    if (row.request_count >= limit) {
      const retryAfterSec = Math.ceil((windowMs - elapsed) / 1000);
      return { ok: false, remaining: 0, retryAfterSec };
    }

    await admin
      .from("rate_limit_buckets")
      .update({ request_count: row.request_count + 1 })
      .eq("bucket_key", key);

    return { ok: true, remaining: limit - row.request_count - 1 };
  } catch {
    return { ok: true, remaining: limit };
  }
}

export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function enforceRateLimit(
  request: Request,
  routeKey: string,
  limit = DEFAULT_LIMIT,
): Promise<RateLimitResult> {
  const ip = clientIp(request);
  return rateLimit(`${routeKey}:${ip}`, limit);
}

/** Admin login: block check without consuming a slot. */
export async function isAdminLoginBlocked(
  ip: string,
  email: string,
): Promise<RateLimitResult> {
  return readBucket(`admin-login-fail:${ip}:${email.toLowerCase()}`, 5, WINDOW_MS);
}

export async function recordAdminLoginFailure(ip: string, email: string) {
  await rateLimit(`admin-login-fail:${ip}:${email.toLowerCase()}`, 5);
}
