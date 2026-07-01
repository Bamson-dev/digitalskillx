import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  PLATFORM_SETTINGS_DEFAULTS,
  type PlatformSettingsValues,
} from "@/lib/platform-settings-shared";

export {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_TIMEZONE,
  PLATFORM_SETTINGS_DEFAULTS,
  TIMEZONE_OPTIONS,
  type PlatformSettingsValues,
} from "@/lib/platform-settings-shared";

type SettingsRow = Database["public"]["Tables"]["platform_settings"]["Row"];

function mergeSettings(row: SettingsRow | null): PlatformSettingsValues {
  if (!row) return { ...PLATFORM_SETTINGS_DEFAULTS };
  return {
    platform_name: row.platform_name || PLATFORM_SETTINGS_DEFAULTS.platform_name,
    logo_url: row.logo_url,
    favicon_url: row.favicon_url,
    primary_color: row.primary_color || PLATFORM_SETTINGS_DEFAULTS.primary_color,
    default_timezone: row.default_timezone || PLATFORM_SETTINGS_DEFAULTS.default_timezone,
    email_sender_name:
      row.email_sender_name ??
      process.env.ZEPTOMAIL_FROM_NAME ??
      PLATFORM_SETTINGS_DEFAULTS.email_sender_name,
    email_reply_to: row.email_reply_to,
    default_certificate_template_id: row.default_certificate_template_id,
  };
}

export async function getPlatformSettings(
  supabase: SupabaseClient<Database>,
): Promise<PlatformSettingsValues> {
  const { data } = await supabase
    .from("platform_settings")
    .select("*")
    .eq("id", "default")
    .maybeSingle();
  return mergeSettings(data);
}

export async function getPlatformSettingsAdmin(): Promise<PlatformSettingsValues> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("platform_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    return mergeSettings(data);
  } catch {
    return { ...PLATFORM_SETTINGS_DEFAULTS };
  }
}

export type EmailSenderConfig = {
  fromName: string;
  fromAddress: string;
  replyTo?: string;
};

/** Resolved sender identity: DB settings override ZeptoMail env defaults. */
export async function getEmailSenderConfig(): Promise<EmailSenderConfig> {
  const config: EmailSenderConfig = {
    fromName: process.env.ZEPTOMAIL_FROM_NAME ?? PLATFORM_SETTINGS_DEFAULTS.platform_name,
    fromAddress: process.env.ZEPTOMAIL_FROM_EMAIL ?? "courses@digitalskillx.com",
  };

  try {
    const settings = await getPlatformSettingsAdmin();
    if (settings.email_sender_name?.trim()) {
      config.fromName = settings.email_sender_name.trim();
    }
    if (settings.email_reply_to?.trim()) {
      config.replyTo = settings.email_reply_to.trim();
    }
  } catch {
    // fall back to env
  }

  return config;
}
