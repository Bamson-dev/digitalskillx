import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";

let bootstrapped = false;

function shouldSyncPassword() {
  return process.env.ADMIN_PASSWORD_SYNC === "true";
}

async function syncAdminPassword(
  admin: Awaited<ReturnType<typeof createAdminClientAsync>>,
  userId: string,
  email: string,
  password: string,
) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error(`[admin-bootstrap] Failed to sync admin password: ${error.message}`);
    return;
  }
  console.log(`[admin-bootstrap] Admin password synced for configured admin email`);
}

async function findAuthUserByEmail(
  admin: Awaited<ReturnType<typeof createAdminClientAsync>>,
  email: string,
) {
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error(`[admin-bootstrap] Failed to list users: ${error.message}`);
      return null;
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

/** Ensure the configured platform admin exists with role=admin. Idempotent. */
export async function ensureAdminAccount() {
  if (bootstrapped) return;
  bootstrapped = true;

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn("[admin-bootstrap] ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin bootstrap");
    return;
  }

  try {
    const admin = await createAdminClientAsync();

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, email")
      .eq("email", email)
      .maybeSingle();

    if (profile) {
      if (profile.role !== "admin") {
        await ensureAdminProfile(admin, {
          userId: profile.id,
          email: profile.email ?? email,
        });
        console.log(`[admin-bootstrap] Promoted existing account to admin: ${email}`);
      } else {
        console.log(`[admin-bootstrap] Admin account already exists: ${email}`);
      }
      if (shouldSyncPassword()) {
        await syncAdminPassword(admin, profile.id, email, password);
      }
      return;
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Platform Admin" },
    });

    if (error) {
      const duplicate =
        error.message.toLowerCase().includes("already") ||
        error.message.toLowerCase().includes("registered");
      if (duplicate) {
        const existing = await findAuthUserByEmail(admin, email);
        if (existing) {
          await ensureAdminProfile(admin, {
            userId: existing.id,
            email: existing.email ?? email,
          });
          console.log(`[admin-bootstrap] Linked existing auth user as admin: ${email}`);
          if (shouldSyncPassword()) {
            await syncAdminPassword(admin, existing.id, email, password);
          }
          return;
        }
      }
      console.error(`[admin-bootstrap] Failed to create admin account: ${error.message}`);
      return;
    }

    await ensureAdminProfile(admin, { userId: created.user.id, email });
    console.log(`[admin-bootstrap] Admin account created: ${email}`);
  } catch (err) {
    console.error(
      "[admin-bootstrap] Unexpected error:",
      err instanceof Error ? err.message : err,
    );
  }
}
