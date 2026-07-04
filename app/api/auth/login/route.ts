import { NextResponse, type NextRequest } from "next/server";
import { runStudentLogin } from "@/lib/auth/run-student-login";
import { createRouteHandlerClientFromCookies } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

/** Password login — session cookies persist via next/headers cookie store. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "/dashboard");
  const next = nextRaw.startsWith("/") ? nextRaw : "/dashboard";

  const supabase = createRouteHandlerClientFromCookies();
  const result = await runStudentLogin({ email, password }, supabase);

  if (!result.ok) {
    const errorUrl = new URL("/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  return NextResponse.redirect(new URL(next, request.url), 303);
}
