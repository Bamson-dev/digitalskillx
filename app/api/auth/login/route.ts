import { NextResponse, type NextRequest } from "next/server";
import { runStudentLogin } from "@/lib/auth/run-student-login";
import { waitForSignedInCookies } from "@/lib/auth/wait-for-auth-cookies";
import {
  createRouteHandlerClientWithPendingCookies,
  redirectWithPendingCookies,
} from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

/** Password login — sign in for tokens, then setSession on redirect response. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  const result = await runStudentLogin({ email, password });
  if (!result.ok) {
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

  return redirectWithPendingCookies(request, pending, next);
}
