import { NextResponse, type NextRequest } from "next/server";
import { createRequestClient, type DbClient } from "@/lib/db/client";
import type { CookieToSet } from "@/lib/db/auth";
import { publicAbsoluteUrl } from "@/lib/public-site-origin";
import { expireLegacyAuthCookies } from "@/lib/supabase/auth-cookie";

export type { CookieToSet };

/** Collect session cookies during sign-in, then attach them to the final response. */
export function createRouteHandlerClientWithPendingCookies(
  request: NextRequest,
  pending: CookieToSet[],
): DbClient {
  const jar = {
    getAll() {
      // Cookies set earlier in this request win over the incoming ones.
      const incoming = request.cookies.getAll().filter((c) => !pending.some((p) => p.name === c.name));
      return [...incoming, ...pending.filter((p) => p.value !== "").map((p) => ({ name: p.name, value: p.value }))];
    },
    setAll(cookiesToSet: CookieToSet[]) {
      for (const cookie of cookiesToSet) {
        const index = pending.findIndex((c) => c.name === cookie.name);
        if (index >= 0) pending[index] = cookie;
        else pending.push(cookie);
      }
    },
  };
  return createRequestClient(jar, () => ({
    userAgent: request.headers.get("user-agent"),
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
  }));
}

export function redirectWithPendingCookies(
  request: NextRequest,
  pending: CookieToSet[],
  pathname: string,
) {
  // Never base redirects on request.url — inside Docker that is localhost:3000.
  const response = NextResponse.redirect(
    publicAbsoluteUrl(pathname, { headers: request.headers, requestUrl: request.url }),
    303,
  );
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }
  expireLegacyAuthCookies(
    (name, value, options) => response.cookies.set(name, value, options),
    request.cookies.getAll().map((c) => c.name),
  );
  return response;
}

export function jsonWithPendingCookies(
  pending: CookieToSet[],
  body: unknown,
  init?: ResponseInit,
) {
  const response = NextResponse.json(body, init);
  for (const { name, value, options } of pending) {
    response.cookies.set(name, value, options);
  }
  return response;
}
