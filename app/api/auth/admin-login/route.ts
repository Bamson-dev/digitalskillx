import { NextResponse, type NextRequest } from "next/server";
import { runAdminLogin } from "@/lib/auth/run-admin-login";
import { isAdminMfaRequired } from "@/lib/admin-mfa";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

/** Admin password login without client JS — immune to stale cached bundles. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const target = isAdminMfaRequired() ? "/admin/mfa/enroll" : "/admin/dashboard";
  const response = NextResponse.redirect(new URL(target, request.url), 303);
  const supabase = createRouteHandlerClient(request, response);

  const result = await runAdminLogin({ email, password }, supabase);
  if (!result.ok) {
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  return response;
}
