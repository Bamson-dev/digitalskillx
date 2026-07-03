import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

const PUBLIC_PREFIXES = [
  "/verify",
  "/auth",
  "/api/auth",
  "/course",
  "/checkout",
  "/api/webhooks",
  "/api/health",
  "/api/cron",
  "/api/admin/sync-password",
  "/api/admin/setup-production",
  "/api/payments/confirm",
];

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/admin/login",
  "/about",
  "/privacy",
  "/terms",
  "/refund-policy",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Refreshes the Supabase session on every request and enforces coarse
 * route protection. Fine-grained admin role checks happen server-side in
 * the admin layout; RLS is the ultimate source of truth.
 */
export async function updateSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next({ request });
  }

  try {
    let response = NextResponse.next({ request });

    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: {
              name: string;
              value: string;
              options?: Record<string, unknown>;
            }[],
          ) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    if (!user && !isPublic(pathname)) {
      const url = request.nextUrl.clone();
      if (pathname.startsWith("/admin/mfa")) {
        url.pathname = "/admin/login";
      } else {
        url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
      }
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    return response;
  } catch (err) {
    console.error("[digitalskillx] middleware session refresh failed:", err);
    return NextResponse.next({ request });
  }
}
