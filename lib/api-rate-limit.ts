import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function rateLimitedResponse(
  request: Request,
  routeKey: string,
  limit = 100,
  windowMs?: number,
): Promise<NextResponse | null> {
  const result = await enforceRateLimit(request, routeKey, limit, windowMs);
  if (result.ok) return null;
  const retryAfterSec = result.retryAfterSec ?? 60;
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return NextResponse.json(
    {
      error: `Too many requests. Please try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      code: "RATE_LIMITED",
      retryAfterSec,
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}
