"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { uploadPublicAsset } from "@/lib/upload-public-asset";
import { DEFAULT_PRIMARY_COLOR, DEFAULT_TIMEZONE } from "@/lib/platform-settings-shared";

export type SettingsState = { error?: string; message?: string };

const SETTINGS_PATH = "/admin/settings";

function fileFrom(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  if (!(value instanceof File) || value.size <= 0) return null;
  return value;
}

function normalizeHexColor(raw: string) {
  const trimmed = raw.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed;
  return DEFAULT_PRIMARY_COLOR;
}

function friendlyDbError(message: string) {
  if (message.includes("platform_settings") && message.includes("does not exist")) {
    return "The platform_settings table is missing. Run sql/platform-settings-only.sql (or RUN_IN_SUPABASE.sql) in the Supabase SQL Editor, then try again.";
  }
  if (message.includes("platform_secrets") && message.includes("does not exist")) {
    return "The platform_secrets table is missing. Run sql/platform-secrets-youtube.sql in the Supabase SQL Editor, then try again.";
  }
  if (message.includes("certificate_templates") && message.includes("does not exist")) {
    return "The certificate_templates table is missing. Apply the main Supabase migrations, then try again.";
  }
  return message;
}

async function upsertSettings(
  patch: Record<string, unknown>,
  adminId: string,
) {
  const supabase = createClient();
  const { error } = await supabase.from("platform_settings").upsert(
    {
      id: "default",
      ...patch,
      updated_by: adminId,
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(friendlyDbError(error.message));
}

export async function savePlatformSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const profile = await requireAdmin();
    const platformName = String(formData.get("platform_name") ?? "").trim();
    const primaryColor = normalizeHexColor(String(formData.get("primary_color") ?? ""));
    const defaultTimezone = String(formData.get("default_timezone") ?? DEFAULT_TIMEZONE).trim();

    if (!platformName) return { error: "Platform name is required." };

    const patch: Record<string, unknown> = {
      platform_name: platformName,
      primary_color: primaryColor,
      default_timezone: defaultTimezone || DEFAULT_TIMEZONE,
    };

    const logoFile = fileFrom(formData, "logo");
    if (logoFile) {
      patch.logo_url = await uploadPublicAsset(logoFile, "settings/logo");
    }

    const faviconFile = fileFrom(formData, "favicon");
    if (faviconFile) {
      patch.favicon_url = await uploadPublicAsset(faviconFile, "settings/favicon");
    }

    await upsertSettings(patch, profile.id);
    await logAudit({ action: "settings_platform_saved" });
    revalidatePath(SETTINGS_PATH);
    return { message: "Platform settings saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save platform settings." };
  }
}

export async function saveEmailSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const profile = await requireAdmin();
    const senderName = String(formData.get("email_sender_name") ?? "").trim();
    const replyTo = String(formData.get("email_reply_to") ?? "").trim();

    if (!senderName) return { error: "Sender name is required." };
    if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
      return { error: "Enter a valid reply-to email address." };
    }

    await upsertSettings(
      {
        email_sender_name: senderName,
        email_reply_to: replyTo || null,
      },
      profile.id,
    );
    await logAudit({ action: "settings_email_saved" });
    revalidatePath(SETTINGS_PATH);
    return { message: "Email settings saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save email settings." };
  }
}

export async function saveCertificateSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const profile = await requireAdmin();
    const supabase = createClient();
    const templateId = String(formData.get("certificate_template_id") ?? "").trim();
    const templateName = String(formData.get("certificate_template_name") ?? "").trim();
    const templateFile = fileFrom(formData, "certificate_template_file");

    let selectedId = templateId || null;

    if (templateFile) {
      if (!templateName) {
        return { error: "Enter a name for the uploaded certificate template." };
      }
      const imageUrl = await uploadPublicAsset(templateFile, "settings/certificates");
      const { data: created, error: createError } = await supabase
        .from("certificate_templates")
        .insert({
          name: templateName,
          base_image_url: imageUrl,
          html_template:
            '<div class="certificate">{{student_name}} — {{course_name}}</div>',
          is_default: false,
        })
        .select("id")
        .single();
      if (createError || !created) {
        return { error: friendlyDbError(createError?.message ?? "Could not create certificate template.") };
      }
      selectedId = created.id;
    }

    if (!selectedId) {
      return { error: "Select an existing template or upload a new one." };
    }

    await supabase.from("certificate_templates").update({ is_default: false }).eq("is_default", true);

    const { error: markError } = await supabase
      .from("certificate_templates")
      .update({ is_default: true })
      .eq("id", selectedId);
    if (markError) return { error: friendlyDbError(markError.message) };

    await upsertSettings({ default_certificate_template_id: selectedId }, profile.id);
    await logAudit({
      action: "settings_certificate_saved",
      targetType: "certificate_template",
      targetId: selectedId,
    });
    revalidatePath(SETTINGS_PATH);
    return { message: "Certificate settings saved." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save certificate settings." };
  }
}

export async function saveIntegrationSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    const profile = await requireAdmin();
    const youtubeApiKey = String(formData.get("youtube_api_key") ?? "").trim();
    const deepseekApiKey = String(formData.get("deepseek_api_key") ?? "").trim();

    if (!youtubeApiKey && !deepseekApiKey) {
      return { error: "Paste a YouTube or DeepSeek API key to save." };
    }
    if (youtubeApiKey === "your-youtube-data-api-key") {
      return { error: "Replace the YouTube placeholder with your real Google API key." };
    }

    const patch: Record<string, unknown> = {
      id: "default",
      updated_by: profile.id,
    };
    if (youtubeApiKey) patch.youtube_api_key = youtubeApiKey;
    if (deepseekApiKey) patch.deepseek_api_key = deepseekApiKey;

    const supabase = createClient();
    const { error } = await supabase.from("platform_secrets").upsert(patch, { onConflict: "id" });
    if (error) throw new Error(friendlyDbError(error.message));

    await logAudit({ action: "settings_integrations_saved" });
    revalidatePath(SETTINGS_PATH);
    return { message: "Integration settings saved." };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not save integration settings.",
    };
  }
}
