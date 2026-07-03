import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import {
  getCachedIntegrationSecret,
  setCachedIntegrationSecret,
} from "@/lib/integration-secrets-cache";
import { getServiceRoleKeySync } from "@/lib/env-service-role";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { runtimeEnv } from "@/lib/runtime-env";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
};

const PASSWORD_ENV = "ZEPTOMAIL_SMTP_PASSWORD";

async function readZeptoPasswordFromDb(): Promise<string | undefined> {
  const serviceRole = getServiceRoleKeySync();
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (serviceRole && supabaseUrl) {
    try {
      const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/platform_secrets?id=eq.default&select=zeptomail_smtp_password`;
      const res = await fetch(url, {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
        cache: "no-store",
      });
      if (res.ok) {
        const rows = (await res.json()) as { zeptomail_smtp_password?: string | null }[];
        const password = rows?.[0]?.zeptomail_smtp_password?.trim();
        if (password) {
          setCachedIntegrationSecret(PASSWORD_ENV, password);
          return password;
        }
      }
    } catch {
      // fall through
    }
  }

  try {
    const admin = await createAdminClientAsync();
    const { data } = await admin
      .from("platform_secrets")
      .select("zeptomail_smtp_password")
      .eq("id", "default")
      .maybeSingle();
    const password = data?.zeptomail_smtp_password?.trim();
    if (password) {
      setCachedIntegrationSecret(PASSWORD_ENV, password);
      return password;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/** Resolve ZeptoMail SMTP credentials from cache, runtime env, or platform_secrets. */
export async function resolveSmtpConfig(): Promise<SmtpConfig | null> {
  await bootstrapRuntimeSecrets();

  const host =
    getCachedIntegrationSecret("ZEPTOMAIL_SMTP_HOST") ??
    runtimeEnv("ZEPTOMAIL_SMTP_HOST") ??
    "smtp.zeptomail.com";
  const port = Number(
    getCachedIntegrationSecret("ZEPTOMAIL_SMTP_PORT") ??
      runtimeEnv("ZEPTOMAIL_SMTP_PORT") ??
      587,
  );
  const user =
    getCachedIntegrationSecret("ZEPTOMAIL_SMTP_USER") ??
    runtimeEnv("ZEPTOMAIL_SMTP_USER") ??
    "emailapikey";
  let password =
    getCachedIntegrationSecret(PASSWORD_ENV) ?? runtimeEnv(PASSWORD_ENV);
  if (!password) {
    password = await readZeptoPasswordFromDb();
  }
  const fromAddress =
    getCachedIntegrationSecret("ZEPTOMAIL_FROM_EMAIL") ??
    runtimeEnv("ZEPTOMAIL_FROM_EMAIL") ??
    "courses@digitalskillx.com";

  if (!password?.trim()) return null;

  return {
    host,
    port,
    user,
    password: password.trim(),
    fromAddress,
  };
}

export async function emailSmtpConfigured() {
  return Boolean(await resolveSmtpConfig());
}
