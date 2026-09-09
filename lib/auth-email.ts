import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { magicLinkEmail, passwordResetEmail } from "@/lib/email/auth-templates";
import { getEmailSenderConfig, getPlatformSettingsAdmin } from "@/lib/platform-settings";
import { formatErrorMessage } from "@/lib/format-error-message";
import { normalizePublicOrigin } from "@/lib/public-site-origin";

function authSiteOrigin() {
  return normalizePublicOrigin(process.env.NEXT_PUBLIC_SITE_URL);
}

function firstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? "there";
}

async function loadProfileByEmail(email: string) {
  const admin = await createAdminClientAsync();
  const { data } = await admin
    .from("profiles")
    .select("id, full_name")
    .ilike("email", email)
    .maybeSingle();
  return data;
}

async function sendAuthLinkEmail(params: {
  email: string;
  type: "recovery" | "magiclink";
  nextPath?: string;
}) {
  const normalized = params.email.trim().toLowerCase();
  const profile = await loadProfileByEmail(normalized);
  if (!profile) {
    return { sent: false as const, skipped: true as const };
  }

  const origin = authSiteOrigin();
  const nextPath = params.nextPath ?? (params.type === "recovery" ? "/reset-password" : "/dashboard");
  const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;

  const admin = await createAdminClientAsync();
  const { data, error } = await admin.auth.admin.generateLink({
    type: params.type,
    email: normalized,
    options: { redirectTo },
  });

  // supabase-js usually nests tokens under `properties`; Contabo GoTrue may
  // also expose them on the top-level payload depending on Auth version.
  const linkPayload = data as
    | {
        properties?: { hashed_token?: string | null } | null;
        hashed_token?: string | null;
      }
    | null
    | undefined;
  const hashedToken =
    linkPayload?.properties?.hashed_token?.trim() ||
    linkPayload?.hashed_token?.trim() ||
    "";
  if (error || !hashedToken) {
    console.error(`[auth-email] ${params.type} link failed:`, error);
    return {
      sent: false as const,
      error: formatErrorMessage(error, "Could not generate sign-in link."),
    };
  }

  const otpType = params.type === "recovery" ? "recovery" : "magiclink";
  const actionUrl = `${origin}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=${otpType}&next=${encodeURIComponent(nextPath)}`;

  const [sender, settings] = await Promise.all([
    getEmailSenderConfig(),
    getPlatformSettingsAdmin(),
  ]);
  const supportEmail = sender.replyTo ?? sender.fromAddress;
  const name = firstName(profile.full_name);

  const tpl =
    params.type === "recovery"
      ? passwordResetEmail({
          firstName: name,
          actionUrl,
          brandColor: settings.primary_color,
          supportEmail,
        })
      : magicLinkEmail({
          firstName: name,
          actionUrl,
          brandColor: settings.primary_color,
          supportEmail,
        });

  const result = await sendEmail({
    to: normalized,
    subject: tpl.subject,
    html: tpl.html,
  });

  if ("skipped" in result && result.skipped) {
    return {
      sent: false as const,
      error: formatErrorMessage(result.error, "Email is not configured yet."),
    };
  }
  if ("error" in result && result.error) {
    return {
      sent: false as const,
      error: formatErrorMessage(result.error, "Email delivery failed."),
    };
  }

  return { sent: true as const };
}

/** Password reset via Resend (no Supabase Auth email). */
export async function sendPasswordResetEmail(email: string) {
  return sendAuthLinkEmail({ email, type: "recovery", nextPath: "/reset-password" });
}

/** Magic-link sign-in via Resend (no Supabase Auth email). */
export async function sendMagicLinkEmail(email: string, nextPath = "/dashboard") {
  return sendAuthLinkEmail({ email, type: "magiclink", nextPath });
}
