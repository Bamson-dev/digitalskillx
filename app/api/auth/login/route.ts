import { NextResponse, type NextRequest } from "next/server";
import { runStudentLogin } from "@/lib/auth/run-student-login";
import { waitForSignedInCookies } from "@/lib/auth/wait-for-auth-cookies";
import {
  createRouteHandlerClientWithPendingCookies,
  redirectWithPendingCookies,
} from "@/lib/supabase/route-handler";
import { safeNextPath } from "@/lib/safe-next-path";
import { enforceRateLimit } from "@/lib/rate-limit";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

export const dynamic = "force-dynamic";

/** Password login — sign in for tokens, then setSession on redirect response. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/dashboard"));

  const limited = await enforceRateLimit(request, "auth-login", 30, 15 * 60 * 1000, {
    failClosed: true,
  });
  if (!limited.ok) {
    secureLogError("auth", ErrorCode.AUTH_RATE_LIMITED, "student login rate limited");
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", "Too many sign-in attempts. Please try again later.");
    return NextResponse.redirect(errorUrl, 303);
  }

  const result = await runStudentLogin({ email, password });
  if (!result.ok) {
    secureLogError("auth", ErrorCode.AUTH_FAILED, "student login failed");
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  const pending: Parameters<typeof createRouteHandlerClientWithPendingCookies>[1] = [];
  const supabase = createRouteHandlerClientWithPendingCookies(request, pending);
  const cookiesReady = waitForSignedInCookies(supabase, pending);

  const { error: sessionError } = await supabase.auth.setSession(result.session);
  if (sessionError) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", sessionError.message);
    return NextResponse.redirect(errorUrl, 303);
  }

  try {
    await cookiesReady;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not persist session.";
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", message);
    return NextResponse.redirect(errorUrl, 303);
  }

  // Best-effort device tracking — never block login if table/migration missing.
  try {
    const { createAdminClientAsync } = await import("@/lib/supabase/admin");
    const { trackAccountSession } = await import("@/lib/account-sessions");
    const admin = await createAdminClientAsync(supabase);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const ua = request.headers.get("user-agent");
      const forwarded = request.headers.get("x-forwarded-for");
      const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip");
      await trackAccountSession(admin, {
        userId: user.id,
        accessToken: result.session.access_token,
        meta: {
          userAgent: ua,
          ipAddress: ip,
          country: request.headers.get("x-vercel-ip-country"),
          city: request.headers.get("x-vercel-ip-city"),
          latitude: Number(request.headers.get("x-vercel-ip-latitude")) || null,
          longitude: Number(request.headers.get("x-vercel-ip-longitude")) || null,
        },
      });
    }
  } catch (err) {
    console.error("[auth/login] session track", err);
  }

  return redirectWithPendingCookies(request, pending, next);
}
