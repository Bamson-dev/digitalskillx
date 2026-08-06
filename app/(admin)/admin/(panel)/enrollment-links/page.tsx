import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { enrollmentLinksEnabled } from "@/lib/enrollment-links/feature-flag";
import { EnrollmentLinksList } from "@/components/admin/enrollment-links-list";

export const metadata: Metadata = { title: "Enrollment Links" };

export default async function EnrollmentLinksPage() {
  await requireAdmin();
  if (!enrollmentLinksEnabled()) {
    return (
      <div className="rounded-xl border border-app bg-white p-6">
        <h1 className="text-xl font-bold">Enrollment Links</h1>
        <p className="mt-2 text-sm text-muted">
          This feature is currently disabled via <code>ENROLLMENT_LINKS_ENABLED</code>.
          Existing purchase, bulk import, and admin enroll flows are unaffected.
        </p>
      </div>
    );
  }
  return <EnrollmentLinksList />;
}
