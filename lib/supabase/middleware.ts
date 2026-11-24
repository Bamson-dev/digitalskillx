import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifyAccessToken } from "@/lib/db/jwt";
import { publicAbsoluteUrl } from "@/lib/public-site-origin";
import {
  COURSE_CONTINUITY_COOKIE,
  isClassroomContinuityPath,
  readContinuityPayload,
} from "@/lib/course-continuity/token";

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
  "/continue", // offline / outage classroom continuity
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
  "/continue",
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
    return pathname === p || pathname.startsWith(`${p}/`);
  });
}

/**
 * Verifies the session cookie on protected requests and enforces coarse
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

  // Admin auth is enforced in server layouts (requireAdmin). Skipping the check here
  // avoids MIDDLEWARE_INVOCATION_TIMEOUT when auth is slow and removes duplicate
  // round-trips on every admin navigation.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    return NextResponse.next({ request });
  }

  // Public pages skip the session check — prevents MIDDLEWARE_INVOCATION_TIMEOUT
  // on /, /learn, marketing pages, etc. Protected routes still refresh the session.
  if (isPublic(pathname)) {
    return NextResponse.next({ request });
  }

  const continuity = await readContinuityPayload(
    request.cookies.get(COURSE_CONTINUITY_COOKIE)?.value,
  );
  const allowContinuity =
    Boolean(continuity) && isClassroomContinuityPath(pathname);

  try {
    // Stateless check: signature and expiry only. Revocation is enforced against
    // auth.sessions by the server-side request client.
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const claims = await verifyAccessToken(token);

    if (!claims) {
      if (allowContinuity) {
        const response = NextResponse.next({ request });
        response.headers.set("x-dsx-continuity", "token");
        return response;
      }
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return redirectToLogin(request, pathname);
    }

    return NextResponse.next({ request });
  } catch (err) {
    console.error("[digitalskillx] middleware session check failed:", err);
    if (allowContinuity) {
      return NextResponse.next({ request });
    }
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
  const continueHint =
    loginPath === "/login" && isClassroomContinuityPath(pathname)
      ? `&continue=${encodeURIComponent("/continue")}`
      : "";
  const url = publicAbsoluteUrl(
    `${loginPath}?next=${encodeURIComponent(next)}${continueHint}`,
    {
      headers: request.headers,
      requestUrl: request.url,
    },
  );
  return NextResponse.redirect(url, 307);
}
