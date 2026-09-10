import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicAbsoluteUrl } from "@/lib/public-site-origin";
import {
  authCookieOptions,
  expireLegacyAuthCookies,
} from "@/lib/supabase/auth-cookie";
import { getAdminSupabaseUrl, getAuthSupabaseUrl } from "@/lib/supabase/url";
import { createServerSupabaseFetch } from "@/lib/supabase/fetch-bridge";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

/** Collect Supabase session cookies during sign-in, then attach to the final redirect. */
export function createRouteHandlerClientWithPendingCookies(
  request: NextRequest,
  pending: CookieToSet[],
): SupabaseClient<Database> {
  // Cookie name is pinned to sb-www-auth-token. Prefer Kong + DNS bridge so
  // setSession does not depend on public hairpin to /api/sb.
  const supabaseUrl = getAdminSupabaseUrl() ?? getAuthSupabaseUrl();
  if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase URL / anon key is not configured");
  }
  return createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          for (const cookie of cookiesToSet) {
            const index = pending.findIndex((c) => c.name === cookie.name);
            if (index >= 0) pending[index] = cookie;
            else pending.push(cookie);
          }
        },
      },
      // Must use DNS bridge — supabase.* has no public DNS on Contabo.
      global: { fetch: createServerSupabaseFetch({ retries: 1, timeoutMs: 20_000 }) },
    },
  );
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
