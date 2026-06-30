import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { AnnouncementForm } from "@/components/admin/announcement-form";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireAdmin();
  const supabase = createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="mt-1 text-sm text-muted">Email and notify your students in one go.</p>
      </div>
      <AnnouncementForm courses={courses ?? []} />
    </div>
  );
}
