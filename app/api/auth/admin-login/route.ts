import { NextResponse, type NextRequest } from "next/server";
import { runAdminLogin } from "@/lib/auth/run-admin-login";
import { waitForSignedInCookies } from "@/lib/auth/wait-for-auth-cookies";
import {
  createRouteHandlerClientWithPendingCookies,
  redirectWithPendingCookies,
} from "@/lib/supabase/route-handler";
import { clientIp, enforceRateLimit, recordAdminLoginFailure } from "@/lib/rate-limit";
import { secureLogError } from "@/lib/secure-log";
import { ErrorCode } from "@/lib/error-codes";

export const dynamic = "force-dynamic";

/** Admin password login — sign in for tokens, then setSession on redirect response. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const limited = await enforceRateLimit(request, "auth-admin-login", 20, 15 * 60 * 1000, {
    failClosed: true,
  });
  if (!limited.ok) {
    secureLogError("auth", ErrorCode.AUTH_RATE_LIMITED, "admin login rate limited");
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", "Too many sign-in attempts. Please try again later.");
    return NextResponse.redirect(errorUrl, 303);
  }

  const result = await runAdminLogin({ email, password });
  if (!result.ok) {
    await recordAdminLoginFailure(clientIp(request), email);
    secureLogError("auth", ErrorCode.AUTH_FAILED, "admin login failed");
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  const pending: Parameters<typeof createRouteHandlerClientWithPendingCookies>[1] = [];
  const supabase = createRouteHandlerClientWithPendingCookies(request, pending);
  const cookiesReady = waitForSignedInCookies(supabase, pending);

  const { error: sessionError } = await supabase.auth.setSession(result.session);
  if (sessionError) {
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", sessionError.message);
    return NextResponse.redirect(errorUrl, 303);
  }

  try {
    await cookiesReady;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not persist session.";
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", message);
    return NextResponse.redirect(errorUrl, 303);
  }

  return redirectWithPendingCookies(request, pending, result.redirectTo);
}
