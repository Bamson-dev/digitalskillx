import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { createSupabaseFetch } from "@/lib/supabase/fetch-retry";
import { publicAbsoluteUrl } from "@/lib/public-site-origin";
import { getServerSupabaseUrl } from "@/lib/supabase/url";

const PUBLIC_PREFIXES = [
  "/verify",
  "/auth",
  "/api/auth",
  "/api/enroll",
  "/course",
  "/learn",
  "/guides",
  "/p", // Stage 11 published imported landing pages (page itself enforces published-only)
  "/checkout",
  "/enroll",
  "/enrollment",
  "/api/sb", // same-origin Contabo Supabase gateway
  "/api/webhooks",
  "/api/health",
  "/api/cron",
  "/api/admin/sync-password",
  "/api/admin/setup-production",
  "/api/admin/paystack-external-refulfill",
  "/api/admin/manual-track-purchase",
  "/api/payments/confirm",
  "/api/payments/initialize",
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
  "/unsubscribe",
  "/api/unsubscribe",
  "/terms",
  "/refund-policy",
  "/browse",
  "/sitemap.xml",
  "/robots.txt",
];

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => {
    // `/course` sales pages must NOT match `/courses` (enrolled classroom).
    if (p === "/course") {
      return pathname === "/course" || pathname.startsWith("/course/");
    }
    return pathname.startsWith(p);
  });
}

/** Avoid MIDDLEWARE_INVOCATION_TIMEOUT when Supabase auth is slow or unreachable. */
const AUTH_GET_USER_TIMEOUT_MS = 4_000;

async function getUserWithTimeout(
  supabase: ReturnType<typeof createServerClient<Database>>,
) {
  return Promise.race([
    supabase.auth.getUser(),
    new Promise<{ data: { user: null }; error: Error }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: { user: null },
            error: new Error("middleware_auth_timeout"),
          }),
        AUTH_GET_USER_TIMEOUT_MS,
      ),
    ),
  ]);
}

/**
 * Refreshes the Supabase session on protected requests and enforces coarse
 * route protection. Fine-grained admin role checks happen server-side in
 * the admin layout; RLS is the ultimate source of truth.
 */
export async function updateSession(request: NextRequest) {
  // Apex → www. Build an absolute URL so we never inherit the container port
  // (behind Coolify/Traefik, nextUrl can be :3000 and would break public links).
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  if (host === "digitalskillx.com") {
    const { pathname, search } = request.nextUrl;
    return NextResponse.redirect(
      `https://www.digitalskillx.com${pathname}${search}`,
      308,
    );
  }

  const { pathname } = request.nextUrl;

  // Admin auth is enforced in server layouts (requireAdmin). Skipping Supabase here
  // avoids MIDDLEWARE_INVOCATION_TIMEOUT when auth is slow and removes duplicate
  // round-trips on every admin navigation.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    return NextResponse.next({ request });
  }

  // Public pages skip Supabase round-trips — prevents MIDDLEWARE_INVOCATION_TIMEOUT
  // on /, /learn, marketing pages, etc. Protected routes still refresh the session.
  if (isPublic(pathname)) {
    return NextResponse.next({ request });
  }

  const supabaseUrl = getServerSupabaseUrl();
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
        global: { fetch: createSupabaseFetch({ retries: 1, timeoutMs: 4_000 }) },
      },
    );

    const {
      data: { user },
    } = await getUserWithTimeout(supabase);

    if (!user) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(request, pathname);
    }

    return response;
  } catch (err) {
    console.error("[digitalskillx] middleware session refresh failed:", err);
    // Fail closed on protected routes — never skip the auth gate on errors.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return redirectToLogin(request, pathname);
  }
}

/** Login redirect without inheriting container :3000 from nextUrl / env. */
function redirectToLogin(request: NextRequest, pathname: string) {
  const loginPath = pathname.startsWith("/admin/mfa")
    ? "/admin/login"
    : pathname.startsWith("/admin")
      ? "/admin/login"
      : "/login";
  const next = `${pathname}${request.nextUrl.search || ""}`;
  const url = publicAbsoluteUrl(`${loginPath}?next=${encodeURIComponent(next)}`, {
    headers: request.headers,
    requestUrl: request.url,
  });
  return NextResponse.redirect(url, 307);
}
