import { NextResponse, type NextRequest } from "next/server";
import { runAdminLogin } from "@/lib/auth/run-admin-login";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

function redirectWithCookies(
  request: NextRequest,
  cookieSource: NextResponse,
  pathname: string,
) {
  const target = NextResponse.redirect(new URL(pathname, request.url), 303);
  cookieSource.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie);
  });
  return target;
}

/** Admin password login without client JS — immune to stale cached bundles. */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const cookieHolder = NextResponse.next();
  const supabase = createRouteHandlerClient(request, cookieHolder);

  const result = await runAdminLogin({ email, password }, supabase);
  if (!result.ok) {
    const errorUrl = new URL("/admin/login", request.url);
    errorUrl.searchParams.set("auth_error", result.error);
    return NextResponse.redirect(errorUrl, 303);
  }

  return redirectWithCookies(request, cookieHolder, result.redirectTo);
}
