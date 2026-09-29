import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { generateStrongPassword } from "@/lib/admin-student-onboarding";
import { sendEmail } from "@/lib/email";
import { passwordResetEmail } from "@/lib/email/auth-templates";
import { getEmailSenderConfig, getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { formatErrorMessage } from "@/lib/format-error-message";
import { normalizePublicOrigin } from "@/lib/public-site-origin";
import { isMissingColumnError } from "@/lib/schema-guard";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENERIC_RESET_SENT =
  "If that email has a DigitalSkillX account or purchase, a password reset link is on its way. Check inbox and spam.";

function authSiteOrigin() {
  return normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

function firstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}

function extractLinkToken(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const row = data as Record<string, unknown>;
  const props = row.properties && typeof row.properties === "object"
    ? (row.properties as Record<string, unknown>)
    : row;

  for (const key of ["hashed_token", "email_otp", "token_hash", "token"]) {
    const value = props[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const actionLink = typeof props.action_link === "string" ? props.action_link : "";
  if (actionLink) {
    try {
      const url = new URL(actionLink);
      const fromQuery =
        url.searchParams.get("token") ||
        url.searchParams.get("token_hash") ||
        url.searchParams.get("hashed_token");
      if (fromQuery?.trim()) return fromQuery.trim();
    } catch {
      /* ignore malformed action_link */
    }
  }
  return "";
}

async function lookupPaidOrEnrolledEmail(
  admin: Awaited<ReturnType<typeof createAdminClientAsync>>,
  email: string,
) {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, is_suspended")
    .ilike("email", email)
    .maybeSingle();

  if (profile?.is_suspended) {
    return { eligible: false as const, suspended: true as const, profile };
  }

  if (profile) return { eligible: true as const, suspended: false as const, profile };

  const txQuery = await admin
    .from("transactions")
    .select("id")
    .eq("buyer_email", email)
    .limit(1)
    .maybeSingle();
  if (txQuery.error && !isMissingColumnError(txQuery.error.message)) {
    console.error("[password-recovery] transactions lookup", txQuery.error.message);
  }
  if (txQuery.data) return { eligible: true as const, suspended: false as const, profile: null };

  return { eligible: false as const, suspended: false as const, profile: null };
}

async function findOrCreateAuthUser(
  admin: Awaited<ReturnType<typeof createAdminClientAsync>>,
  email: string,
  fullName: string | null,
  canProvision: boolean,
) {
  const recovery = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  if (!recovery.error && recovery.data?.user?.id) {
    const userId = recovery.data.user.id;
    if (recovery.data.user.email_confirmed_at == null) {
      await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    }
    return { userId, linkData: recovery.data };
  }

  const notFound = recovery.error?.message?.toLowerCase().includes("user not found");
  if (!notFound && recovery.error) {
    const magic = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (!magic.error && magic.data?.user?.id) {
      return { userId: magic.data.user.id, linkData: magic.data };
    }
    throw new Error(recovery.error.message);
  }

  if (!canProvision) {
    throw new Error("user not found");
  }

  const created = await admin.auth.admin.createUser({
    email,
    password: generateStrongPassword(),
    email_confirm: true,
    user_metadata: { full_name: fullName || email.split("@")[0] },
  });
  if (created.error || !created.data.user) {
    throw new Error(created.error?.message ?? "Could not create a login for this email.");
  }

  const retry = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (retry.error) throw new Error(retry.error.message);
  return { userId: created.data.user.id, linkData: retry.data };
}

/**
 * Send a password-reset email for an existing or eligible student.
 * Never reveals whether the email is registered.
 */
export async function sendStudentPasswordReset(emailRaw: string): Promise<{
  ok: true;
  message: string;
} | { ok: false; error: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  try {
    const admin = await createAdminClientAsync();
    const record = await lookupPaidOrEnrolledEmail(admin, email);
    if (record.suspended) {
      return { ok: true, message: GENERIC_RESET_SENT };
    }

    let linkData: unknown = null;
    try {
      const ensured = await findOrCreateAuthUser(
        admin,
        email,
        record.profile?.full_name ?? null,
        record.eligible,
      );
      linkData = ensured.linkData;

      if (record.profile && record.profile.id !== ensured.userId) {
        // Keep Auth + profile aligned when possible; enrollments use student_id.
      } else if (!record.profile) {
        const { error: insertError } = await admin.from("profiles").insert({
          id: ensured.userId,
          email,
          full_name: email.split("@")[0],
          role: "student",
          is_suspended: false,
        });
        if (insertError && !/duplicate|unique/i.test(insertError.message)) {
          console.error("[password-recovery] profile insert", insertError.message);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes("user not found") && !record.eligible) {
        return { ok: true, message: GENERIC_RESET_SENT };
      }
      if (!record.eligible) {
        return { ok: true, message: GENERIC_RESET_SENT };
      }
      console.error("[password-recovery] ensure user failed:", message);
      return {
        ok: false,
        error: "Could not start a password reset. Try again in a minute, or email courses@digitalskillx.com.",
      };
    }

    const hashedToken = extractLinkToken(linkData);
    if (!hashedToken) {
      console.error("[password-recovery] missing token in generateLink payload");
      return {
        ok: false,
        error: "Could not generate a reset link. Try again, or email courses@digitalskillx.com.",
      };
    }

    const origin = authSiteOrigin();
    const actionUrl = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=${encodeURIComponent("/reset-password")}`;

    const [sender, settings] = await Promise.all([
      getEmailSenderConfig(),
      getPlatformSettingsAdmin(),
    ]);
    const tpl = passwordResetEmail({
      firstName: firstName(record.profile?.full_name),
      actionUrl,
      brandColor: settings.primary_color,
      supportEmail: sender.replyTo ?? sender.fromAddress,
    });

    const result = await sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
    });

    if ("skipped" in result && result.skipped) {
      return { ok: false, error: formatErrorMessage(result.error, "Email is not configured yet.") };
    }
    if ("error" in result && result.error) {
      return { ok: false, error: formatErrorMessage(result.error, "Email delivery failed. Try again shortly.") };
    }

    return { ok: true, message: GENERIC_RESET_SENT };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send reset link.";
    if (message.toLowerCase().includes("service role")) {
      return { ok: false, error: "Sign-in recovery is temporarily unavailable. Email courses@digitalskillx.com." };
    }
    console.error("[password-recovery]", message);
    return {
      ok: false,
      error: "Could not send a reset link. Try again, or email courses@digitalskillx.com.",
    };
  }
}
