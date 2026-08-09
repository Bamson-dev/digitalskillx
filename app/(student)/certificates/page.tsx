import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentCertificates } from "@/lib/student-certificates";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { getCourseRecommendationsForDisplay } from "@/lib/course-recommendations";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const profile = await requireStudent();
  const certificates = await getStudentCertificates(profile.id);

  let nextStepHref: string | null = null;
  let nextStepTitle: string | null = null;

  if (certificates.length > 0) {
    try {
      await bootstrapRuntimeSecrets();
      const supabase = createClient();
      const admin = await createAdminClientAsync(supabase);
      const seedCourseId = certificates[0]?.courseId;
      if (seedCourseId) {
        const catalog = await fetchPublishedCourses<CatalogCourse>(
          "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, is_coming_soon, category:course_categories(name)",
        );
        const recommendable = catalog.map((c) => ({
          ...c,
          category_name: c.category?.name ?? null,
        }));
        const { data: ownedRows } = await admin
          .from("enrollments")
          .select("course_id")
          .eq("student_id", profile.id);
        const ownedIds = new Set((ownedRows ?? []).map((r) => r.course_id));
        const recs = await getCourseRecommendationsForDisplay(admin, {
          courseId: seedCourseId,
          catalog: recommendable,
          ownedIds,
          kind: ["next_step", "upsell", "cross_sell", "related"],
          limit: 1,
        });
        const first = recs[0];
        if (first?.course?.id) {
          nextStepHref = `/course/${first.course.id}`;
          nextStepTitle = first.course.title;
        }
      }
    } catch (err) {
      console.error("[CertificatesPage] next-step recommendation failed", err);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Certificates</h1>
        <p className="mt-1 text-sm text-muted">
          Certificates you&apos;ve earned by completing courses.
        </p>
      </div>

      {certificates.length === 0 ? (
        <Card className="space-y-3 p-6 text-center text-sm text-muted">
          <p>No certificates yet. Complete a course to earn one.</p>
          <Link href="/courses" className="inline-flex font-semibold text-brand hover:underline">
            Go to my courses
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {certificates.map((c) => (
              <Link key={c.id} href={`/certificates/${c.id}`}>
                <Card className="flex items-center gap-4 transition-shadow hover:shadow-md">
                  <div className="rounded-lg bg-brand-50 p-3 text-brand">
                    <Award className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{c.courseTitle ?? "Course"}</h3>
                    <p className="truncate text-sm text-neutral-700">{c.recipientName}</p>
                    <p className="text-xs text-muted">
                      #{c.certificateNumber} · Issued {formatDate(c.issuedAt)}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {nextStepHref ? (
            <p className="text-sm text-neutral-600">
              <Link href={nextStepHref} className="font-medium text-brand hover:underline">
                Recommended next step
              </Link>
              {nextStepTitle ? <span className="text-muted"> — {nextStepTitle}</span> : null}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
