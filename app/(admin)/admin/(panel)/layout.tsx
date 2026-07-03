import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { warmIntegrationSecretsFromAdminSession } from "@/lib/integration-secrets-cache";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  const supabase = createClient();
  await warmIntegrationSecretsFromAdminSession(supabase);

  return (
    <div className="flex min-h-screen bg-brand-50/40">
      <AdminSidebar adminName={admin.full_name ?? admin.email} />
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
