import { NextResponse, type NextRequest } from "next/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";

export const dynamic = "force-dynamic";

/**
 * One-time ops helper: sync Supabase Auth password from ADMIN_PASSWORD env.
 * Protect with CRON_SECRET. Call after setting ADMIN_EMAIL / ADMIN_PASSWORD on Coolify.
 *
 * curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-staging-url/api/admin/sync-password
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const expected = secret ? `Bearer ${secret}` : "";

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not set on the server (Vercel → Settings → Environment Variables)." },
      { status: 503 },
    );
  }

  if (auth !== expected) {
    return NextResponse.json(
      { error: "Unauthorized — Bearer token does not match CRON_SECRET on the server." },
      { status: 401 },
    );
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "ADMIN_EMAIL and ADMIN_PASSWORD must be set in server environment" },
      { status: 503 },
    );
  }

  try {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync();

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
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
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
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      userId = created.user.id;
      await admin.from("profiles").update({ role: "admin" }).eq("id", userId);
      return NextResponse.json({
        ok: true,
        action: "created",
        email,
        message: "Admin account created. Sign in with ADMIN_EMAIL and ADMIN_PASSWORD.",
      });
    }

    const { error: pwError } = await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (pwError) {
      return NextResponse.json({ error: pwError.message }, { status: 500 });
    }

    await admin.from("profiles").update({ role: "admin" }).eq("id", userId);

    return NextResponse.json({
      ok: true,
      action: "password_synced",
      email,
      message: "Password updated in Supabase Auth. Sign in with your ADMIN_PASSWORD value.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
