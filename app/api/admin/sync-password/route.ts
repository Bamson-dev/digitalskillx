import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { serviceRoleKeyMissingMessageAsync } from "@/lib/env-service-role";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";

export const dynamic = "force-dynamic";

/**
 * Sync Supabase Auth password from ADMIN_PASSWORD env.
 * curl -X POST -H "Authorization: Bearer CRON_SECRET" https://www.digitalskillx.com/api/admin/sync-password
 */
export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
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
      await ensureAdminProfile(admin, { userId, email });
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

    await ensureAdminProfile(admin, { userId, email });

    return NextResponse.json({
      ok: true,
      action: "password_synced",
      email,
      message: "Password updated in Supabase Auth. Sign in with your ADMIN_PASSWORD value.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    if (message.toLowerCase().includes("service role")) {
      return NextResponse.json({ error: await serviceRoleKeyMissingMessageAsync() }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
