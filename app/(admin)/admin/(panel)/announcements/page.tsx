import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { AnnouncementForm } from "@/components/admin/announcement-form";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="mt-1 text-sm text-muted">
          Send email and in-app announcements to all students or target specific courses. Recipients
          see messages on their dashboard and notification bell.
        </p>
      </div>
      <AnnouncementForm courses={courses ?? []} />
    </div>
  );
}
