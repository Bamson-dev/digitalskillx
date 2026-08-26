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
import {
  assertDeviceLoginAllowed,
  DEVICE_KEY_COOKIE,
  newDeviceKey,
  readDeviceKeyFromRequest,
} from "@/lib/device-login-limit";

export const dynamic = "force-dynamic";

function appendDeviceCookie(
  response: NextResponse,
  deviceKey: string,
) {
  response.cookies.set(DEVICE_KEY_COOKIE, deviceKey, {
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  });
  return response;
}

/** Password login — sign in for tokens, then setSession on redirect response. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? "/dashboard"));
  const formDeviceKey = String(formData.get("device_key") ?? "").trim();
  const deviceKey =
    (formDeviceKey && /^[a-zA-Z0-9_-]{8,128}$/.test(formDeviceKey) ? formDeviceKey : null) ||
    readDeviceKeyFromRequest(request) ||
    newDeviceKey();

  const limited = await enforceRateLimit(request, "auth-login", 30, 15 * 60 * 1000, {
    failClosed: true,
  });
  if (!limited.ok) {
    secureLogError("auth", ErrorCode.AUTH_RATE_LIMITED, "student login rate limited");
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", "Too many sign-in attempts. Please try again later.");
    return appendDeviceCookie(NextResponse.redirect(errorUrl, 303), deviceKey);
  }

  const result = await runStudentLogin({ email, password });
  if (!result.ok) {
    secureLogError("auth", ErrorCode.AUTH_FAILED, "student login failed");
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return appendDeviceCookie(NextResponse.redirect(errorUrl, 303), deviceKey);
  }

  // Paid-program device limit — block before cookies are set.
  try {
    const { createAdminClientAsync } = await import("@/lib/supabase/admin");
    const admin = await createAdminClientAsync();
    const decision = await assertDeviceLoginAllowed(admin, {
      studentId: result.userId,
      deviceKey,
      role: result.role,
    });
    if (!decision.allowed) {
      secureLogError("auth", ErrorCode.AUTH_FAILED, "device limit blocked login");
      const errorUrl = new URL("/login", request.url);
      errorUrl.searchParams.set("auth_error", decision.error);
      return appendDeviceCookie(NextResponse.redirect(errorUrl, 303), deviceKey);
    }
  } catch (err) {
    console.error("[auth/login] device limit check", err);
  }

  const pending: Parameters<typeof createRouteHandlerClientWithPendingCookies>[1] = [];
  const supabase = createRouteHandlerClientWithPendingCookies(request, pending);
  const cookiesReady = waitForSignedInCookies(supabase, pending);

  const { error: sessionError } = await supabase.auth.setSession(result.session);
  if (sessionError) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", sessionError.message);
    return appendDeviceCookie(NextResponse.redirect(errorUrl, 303), deviceKey);
  }

  try {
    await cookiesReady;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not persist session.";
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", message);
    return appendDeviceCookie(NextResponse.redirect(errorUrl, 303), deviceKey);
  }

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
        deviceKey,
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

  const redirect = redirectWithPendingCookies(request, pending, next);
  return appendDeviceCookie(redirect, deviceKey);
}
