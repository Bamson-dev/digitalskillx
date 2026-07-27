import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Session refresh for pages only — API routes enforce their own auth.
     * Skipping /api avoids MIDDLEWARE_INVOCATION_TIMEOUT during bulk-import polling.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
