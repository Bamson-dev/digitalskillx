import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { EnrollmentLinkDetail } from "@/components/admin/enrollment-link-detail";

export const metadata: Metadata = { title: "Enrollment link" };

export default async function EnrollmentLinkDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  return (
    <EnrollmentLinkDetail linkId={params.id} allCourses={courses ?? []} />
  );
}
