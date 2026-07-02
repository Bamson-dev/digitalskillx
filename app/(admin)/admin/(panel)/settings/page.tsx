import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getYoutubeApiKeyConfiguredFlag } from "@/lib/env-youtube";
import { deepseekApiKeyConfigured } from "@/lib/env-deepseek";
import { paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { SettingsForms } from "@/components/admin/settings-forms";

export const metadata: Metadata = { title: "Settings" };

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const supabase = createClient();

  const [settings, { data: categories }, youtubeConfigured, deepseekConfigured, paystackConfigured] =
    await Promise.all([
    getPlatformSettings(supabase),
    supabase
      .from("course_categories")
      .select("id, name, template_key")
      .order("name"),
    getYoutubeApiKeyConfiguredFlag(supabase),
    deepseekApiKeyConfigured(supabase),
    paystackSecretKeyConfigured(supabase),
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
        categories={categories ?? []}
        youtubeConfigured={youtubeConfigured}
        deepseekConfigured={deepseekConfigured}
        paystackConfigured={paystackConfigured}
      />
    </div>
  );
}
