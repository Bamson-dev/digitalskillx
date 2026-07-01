import type { Metadata } from "next";
import { SectionPlaceholder } from "@/components/admin/section-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function AdminSettingsPage() {
  return (
    <SectionPlaceholder
      title="Settings"
      description="Configure the platform, branding and automations."
      phase="Phase 4 / 5"
      bullets={[
        "Platform name, logo, favicon, primary colour, timezone",
        "Email sender identity and templates (ZeptoMail)",
        "Certificate default template",
        "Automation rule builder and system logs",
      ]}
    />
  );
}
