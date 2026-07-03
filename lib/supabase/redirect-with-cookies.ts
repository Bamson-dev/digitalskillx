import { NextResponse, type NextRequest } from "next/server";

/** Copy Supabase session cookies from a route-handler response onto a redirect. */
export function redirectWithCookies(
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
