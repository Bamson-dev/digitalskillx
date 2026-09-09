import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { publicAbsoluteUrl } from "@/lib/public-site-origin";
import { getServerSupabaseUrl } from "@/lib/supabase/url";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";

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
  const supabaseUrl = getServerSupabaseUrl();
  if (!supabaseUrl || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Supabase URL / anon key is not configured");
  }
  return createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
      global: { fetch: createSupabaseFetch({ retries: 1, timeoutMs: 20_000 }) },
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
