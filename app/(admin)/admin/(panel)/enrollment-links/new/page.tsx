import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { EnrollmentLinkWizard } from "@/components/admin/enrollment-link-wizard";

export const metadata: Metadata = { title: "Create enrollment link" };

export default async function NewEnrollmentLinkPage() {
  await requireAdmin();
  const supabase = await getAdminSupabase();
  const { data: courses } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  return <EnrollmentLinkWizard courses={courses ?? []} />;
}
