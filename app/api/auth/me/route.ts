import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Lightweight session probe for auth debugging and health checks. */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  let profile: { id: string; role: string; is_suspended: boolean } | null = null;
  let profileError: string | null = null;
  if (user) {
    const { data, error: pErr } = await supabase
      .from("profiles")
      .select("id, role, is_suspended")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
    profileError = pErr?.message ?? null;
  }

  return NextResponse.json({
    authenticated: Boolean(user),
    userId: user?.id ?? null,
    email: user?.email ?? null,
    error: error?.message ?? null,
    profile,
    profileError,
  });
}
