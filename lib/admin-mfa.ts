import "server-only";
import { createClient } from "@/lib/supabase/server";

export type MfaStatus = {
  enrolled: boolean;
  verified: boolean;
  factorId: string | null;
};

export async function getAdminMfaStatus(): Promise<MfaStatus> {
  const supabase = createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.find((f) => f.status === "verified") ?? null;
  if (!totp) {
    return { enrolled: false, verified: false, factorId: null };
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const verified = aal?.currentLevel === "aal2";

  return { enrolled: true, verified, factorId: totp.id };
}

export async function requireAdminMfaSession() {
  const status = await getAdminMfaStatus();
  if (!status.enrolled) return { ok: false as const, reason: "enroll" as const };
  if (!status.verified) return { ok: false as const, reason: "verify" as const };
  return { ok: true as const };
}
