import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * OAuth / magic-link / email-confirmation callback.
 * Exchanges the `code` for a session, then routes the user to the right home.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        const home =
          profile?.role === "admin" ? "/admin/dashboard" : "/dashboard";
        return NextResponse.redirect(`${origin}${home}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
