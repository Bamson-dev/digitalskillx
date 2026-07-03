import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { runtimeEnv } from "@/lib/runtime-env";
import { readServiceRoleFromEnv } from "@/lib/platform-secrets-bootstrap";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";
import { configuredAdminEmail } from "@/lib/admin-email";

export const dynamic = "force-dynamic";

/**
 * One-shot production setup (Vercel):
 * 1. Requires SUPABASE_SERVICE_ROLE_KEY in Vercel env (cannot bootstrap from placeholder DB keys).
 * 2. Saves env secrets into platform_secrets.
 * 3. Syncs admin password from ADMIN_PASSWORD.
 *
 * curl -X POST -H "Authorization: Bearer CRON_SECRET" https://www.digitalskillx.com/api/admin/setup-production
 */
export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const serviceRole = readServiceRoleFromEnv();
  if (!serviceRole) {
    return NextResponse.json(
      {
        error: "SUPABASE_SERVICE_ROLE_KEY is not in Vercel environment variables.",
        fix: [
          "Open Supabase Dashboard for the PRODUCTION project (same as NEXT_PUBLIC_SUPABASE_URL on Vercel).",
          "Project Settings → API → copy service_role key.",
          "Vercel → digitalskillx → Settings → Environment Variables → Production → add SUPABASE_SERVICE_ROLE_KEY.",
          "Redeploy, then call this endpoint again.",
        ],
        health: "https://www.digitalskillx.com/api/health",
      },
      { status: 503 },
    );
  }

  const email = configuredAdminEmail();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return NextResponse.json(
      { error: "Set ADMIN_EMAIL and ADMIN_PASSWORD in Vercel Environment Variables (Production)." },
      { status: 503 },
    );
  }

  try {
    const admin = await createAdminClientAsync();

    const patch = {
      id: "default" as const,
      supabase_service_role_key: serviceRole,
      paystack_secret_key: runtimeEnv("PAYSTACK_SECRET_KEY") ?? null,
      zeptomail_smtp_password: runtimeEnv("ZEPTOMAIL_SMTP_PASSWORD") ?? null,
      youtube_api_key: runtimeEnv("YOUTUBE_API_KEY") ?? null,
      deepseek_api_key: runtimeEnv("DEEPSEEK_API_KEY") ?? null,
    };

    const { error: secretsError } = await admin.from("platform_secrets").upsert(patch, {
      onConflict: "id",
    });
    if (secretsError) {
      return NextResponse.json({ error: secretsError.message }, { status: 500 });
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("id, email, role")
      .eq("email", email)
      .maybeSingle();

    let userId = profile?.id;

    if (!userId) {
      let page = 1;
      while (page <= 10) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        const match = data.users.find((u) => u.email?.toLowerCase() === email);
        if (match) {
          userId = match.id;
          break;
        }
        if (data.users.length < 200) break;
        page += 1;
      }
    }

    if (!userId) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Platform Admin" },
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      userId = created.user.id;
    } else {
      const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (pwError) return NextResponse.json({ error: pwError.message }, { status: 500 });
    }

    await ensureAdminProfile(admin, {
      userId,
      email,
      fullName: "Platform Admin",
    });

    const { data: verify } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    return NextResponse.json({
      ok: true,
      message: "Production secrets saved to platform_secrets and admin password synced.",
      email,
      profileRole: verify?.role ?? "unknown",
      savedToDb: Object.keys(patch).filter((k) => k !== "id" && patch[k as keyof typeof patch]),
      next: "Sign in at https://www.digitalskillx.com/admin/login",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 },
    );
  }
}
