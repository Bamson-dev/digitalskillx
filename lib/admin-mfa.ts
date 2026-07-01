import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MfaStatus = {
  enrolled: boolean;
  verified: boolean;
  factorId: string | null;
};

/** Set ADMIN_MFA_REQUIRED=false on staging to skip authenticator setup. Default: required. */
export function isAdminMfaRequired() {
  return process.env.ADMIN_MFA_REQUIRED !== "false";
}

export async function getAdminMfaStatus(): Promise<MfaStatus> {
  if (!isAdminMfaRequired()) {
    return { enrolled: true, verified: true, factorId: null };
  }

  try {
    const supabase = createClient();
    const { data: factors, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      console.error("[admin-mfa] listFactors failed:", error.message);
      return { enrolled: false, verified: false, factorId: null };
    }

    const totp = factors?.totp?.find((f) => f.status === "verified") ?? null;
    if (!totp) {
      return { enrolled: false, verified: false, factorId: null };
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const verified = aal?.currentLevel === "aal2";

    return { enrolled: true, verified, factorId: totp.id };
  } catch (err) {
    console.error("[admin-mfa] status check failed:", err);
    return { enrolled: false, verified: false, factorId: null };
  }
}

export async function requireAdminMfaSession() {
  const status = await getAdminMfaStatus();
  if (!status.enrolled) return { ok: false as const, reason: "enroll" as const };
  if (!status.verified) return { ok: false as const, reason: "verify" as const };
  return { ok: true as const };
}
