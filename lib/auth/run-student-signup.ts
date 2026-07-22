import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendWelcomeEmailIfNeeded } from "@/lib/system-email-triggers";
import { serviceRoleKeyMissingMessageAsync } from "@/lib/env-service-role";

export async function runStudentSignUp(params: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const fullName = params.fullName.trim();
  const email = params.email.trim().toLowerCase();
  const password = params.password;

  if (!email || !password || !fullName) {
    return { ok: false, error: "Name, email and password are required." };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  try {
    const admin = await createAdminClientAsync();

    const { data: existing } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      return { ok: false, error: "An account with this email already exists. Try logging in." };
    }

    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already")) {
        return { ok: false, error: "An account with this email already exists. Try logging in." };
      }
      return { ok: false, error: error.message };
    }

    await admin.from("profiles").update({ full_name: fullName }).eq("id", created.user.id);

    const welcome = await sendWelcomeEmailIfNeeded({
      studentId: created.user.id,
      fullName,
      email,
      password,
    });

    if (!welcome.sent) {
      return {
        ok: true,
        message:
          "Account created — you can log in now. Welcome email could not be sent yet; ask support if you need help.",
      };
    }

    return {
      ok: true,
      message:
        "Account created! Check your inbox for a welcome email from DigitalSkillX, then log in.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not create account.";
    if (message.includes("service role")) {
      return { ok: false, error: await serviceRoleKeyMissingMessageAsync() };
    }
    return { ok: false, error: message };
  }
}
