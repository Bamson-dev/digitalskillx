import { AdminSkeleton } from "@/components/admin/admin-skeleton";

export default function AdminPanelLoading() {
  return (
    <div className="space-y-6">
      <AdminSkeleton lines={6} />
      <p className="text-sm text-muted">Loading…</p>
    </div>
  );
}
