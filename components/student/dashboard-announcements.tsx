import Link from "next/link";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export async function DashboardAnnouncements({ studentId }: { studentId: string }) {
  const supabase = createClient();
  const { data: announcements } = await supabase
    .from("notifications")
    .select("id, title, message, link_url, created_at, is_read")
    .eq("student_id", studentId)
    .eq("type", "announcement")
    .order("created_at", { ascending: false })
    .limit(5);

  if (!announcements?.length) return null;

  return (
    <section aria-label="Announcements">
      <div className="mb-3 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-brand" />
        <h2 className="font-display text-lg font-bold text-neutral-900">Announcements</h2>
      </div>
      <div className="space-y-3">
        {announcements.map((item) => {
          const card = (
            <article
              className={`rounded-xl border px-4 py-4 sm:px-5 ${
                item.is_read
                  ? "border-surface-border bg-white"
                  : "border-brand/25 bg-brand/5 shadow-sm"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold text-neutral-900">{item.title ?? "Announcement"}</h3>
                <time className="text-xs text-neutral-500">
                  {formatDate(item.created_at, { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </div>
              {item.message ? (
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{item.message}</p>
              ) : null}
              {item.link_url ? (
                <p className="mt-3 text-sm font-semibold text-brand">View details →</p>
              ) : null}
            </article>
          );

          if (item.link_url) {
            return (
              <Link key={item.id} href={item.link_url} className="block transition hover:opacity-95">
                {card}
              </Link>
            );
          }

          return <div key={item.id}>{card}</div>;
        })}
      </div>
    </section>
  );
}
