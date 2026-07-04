import { NextResponse, type NextRequest } from "next/server";
import { runAdminLogin } from "@/lib/auth/run-admin-login";
import { createRouteHandlerClientFromCookies } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

/** Admin password login — session cookies persist via next/headers cookie store. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = createRouteHandlerClientFromCookies();
  const result = await runAdminLogin({ email, password }, supabase);

  if (!result.ok) {
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  return NextResponse.redirect(new URL(result.redirectTo, request.url), 303);
}
