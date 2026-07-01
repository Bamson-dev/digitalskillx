import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function rateLimitedResponse(
  request: Request,
  routeKey: string,
  limit = 100,
): Promise<NextResponse | null> {
  const result = await enforceRateLimit(request, routeKey, limit);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: result.retryAfterSec
        ? { "Retry-After": String(result.retryAfterSec) }
        : undefined,
    },
  );
}
