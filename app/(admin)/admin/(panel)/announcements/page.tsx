import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { AnnouncementForm } from "@/components/admin/announcement-form";
import { PlatformAnnouncementManager } from "@/components/admin/platform-announcement-manager";
import { fetchAllPlatformAnnouncements } from "@/lib/platform-announcements";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const [{ data: courses }, platformAnnouncements] = await Promise.all([
    supabase.from("courses").select("id, title").order("title"),
    fetchAllPlatformAnnouncements(supabase),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold">Announcements</h1>
        <p className="mt-1 text-sm text-muted">
          Manage fixed dashboard banners for students, or send one-time email and in-app messages.
        </p>
      </div>

      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-neutral-900">
            Fixed student announcements
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Active fixed announcements appear at the top of the student dashboard until you
            unpublish, unpin, or set an end date.
          </p>
        </div>
        <PlatformAnnouncementManager announcements={platformAnnouncements} />
      </section>

      <section className="space-y-4 border-t border-neutral-200 pt-10">
        <div>
          <h2 className="font-display text-xl font-bold text-neutral-900">
            Email &amp; notification blast
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Send email and in-app announcements to all students or target specific courses.
            Recipients also see these in the notification bell.
          </p>
        </div>
        <AnnouncementForm courses={courses ?? []} />
      </section>
    </div>
  );
}
