import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

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
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
    },
  );
}

export function redirectWithPendingCookies(
  request: NextRequest,
  pending: CookieToSet[],
  pathname: string,
) {
  const response = NextResponse.redirect(new URL(pathname, request.url), 303);
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
