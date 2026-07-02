import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getYoutubeApiKeyConfiguredFlag } from "@/lib/env-youtube";
import { deepseekApiKeyConfigured } from "@/lib/env-deepseek";
import { SettingsForms } from "@/components/admin/settings-forms";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = createClient();

  const [settings, { data: templates }, youtubeConfigured, deepseekConfigured] = await Promise.all([
    getPlatformSettings(supabase),
    supabase
      .from("certificate_templates")
      .select("id, name, is_default, base_image_url")
      .order("name"),
    getYoutubeApiKeyConfiguredFlag(supabase),
    deepseekApiKeyConfigured(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Configure platform branding, integrations, email identity, and certificate defaults.
        </p>
      </div>
      <SettingsForms
        settings={settings}
        templates={templates ?? []}
        youtubeConfigured={youtubeConfigured}
        deepseekConfigured={deepseekConfigured}
      />
    </div>
  );
}
