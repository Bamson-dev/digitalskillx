import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { warmIntegrationSecretsFromAdminSession } from "@/lib/integration-secrets-cache";
import { AdminShell } from "@/components/admin/admin-sidebar";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  const supabase = createClient();
  await warmIntegrationSecretsFromAdminSession(supabase);

  return (
    <AdminShell adminName={admin.full_name ?? admin.email}>{children}</AdminShell>
  );
}
