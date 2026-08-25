import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { warmIntegrationSecretsFromAdminSession } from "@/lib/integration-secrets-cache";
import { AdminErrorBoundary } from "@/components/admin/admin-error-boundary";
import { AdminShell } from "@/components/admin/admin-sidebar";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  const supabase = createClient();
  try {
    await warmIntegrationSecretsFromAdminSession(supabase);
  } catch {
    // Secrets warming must not take down the whole admin chrome.
  }

  return (
    <AdminErrorBoundary>
      <AdminShell adminName={admin.full_name ?? admin.email}>{children}</AdminShell>
    </AdminErrorBoundary>
  );
}
