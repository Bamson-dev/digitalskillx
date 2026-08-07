import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";

/**
 * Clears auth registration rate-limit buckets (admin only).
 * Use when legitimate enrollment-link signups are blocked after burst traffic.
 */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-clear-rate-limits", 10);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { prefix?: string };
  const prefix = String(body.prefix ?? "auth-register:").trim() || "auth-register:";
  if (!/^[a-z0-9_-]+:$/i.test(prefix) && !prefix.startsWith("auth-register")) {
    return NextResponse.json({ error: "Invalid prefix." }, { status: 400 });
  }

  const admin = await createAdminClientAsync();
  const { data, error } = await admin
    .from("rate_limit_buckets")
    .delete()
    .like("bucket_key", `${prefix}%`)
    .select("bucket_key");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    cleared: data?.length ?? 0,
    prefix,
  });
}
