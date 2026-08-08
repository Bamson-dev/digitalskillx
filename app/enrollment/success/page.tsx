import type { Metadata } from "next";
import { Suspense } from "react";
import { EnrollmentSuccessClient } from "@/components/enrollment/enrollment-success-client";
import { RecommendationRail } from "@/components/marketplace/recommendation-rail";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { recommendCourses } from "@/lib/recommendations";

export const metadata: Metadata = { title: "Welcome" };

export default async function EnrollmentSuccessPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ownedIds = new Set<string>();
  let seed: { id: string; title: string; category_name: string | null } | null = null;

  const catalog = await fetchPublishedCourses<CatalogCourse>(
    "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, is_coming_soon, category:course_categories(name)",
  );
  const recommendable = catalog.map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));

  if (user) {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(supabase);
    let studentId = user.id;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();
      studentId = await syncStudentCourseAccess(admin, {
        authUserId: user.id,
        profileEmail: profile?.email,
      });
    } catch (err) {
      console.error("[EnrollmentSuccessPage] syncStudentCourseAccess failed", err);
    }

    const { data: enrollments } = await admin
      .from("enrollments")
      .select("course_id, enrolled_at")
      .eq("student_id", studentId)
      .order("enrolled_at", { ascending: false });

    for (const row of enrollments ?? []) {
      ownedIds.add(row.course_id);
    }

    const latestId = enrollments?.[0]?.course_id;
    if (latestId) {
      const latest = recommendable.find((c) => c.id === latestId);
      if (latest) {
        seed = {
          id: latest.id,
          title: latest.title,
          category_name: latest.category_name,
        };
      }
    }
  }

  const recommendations = recommendCourses({
    catalog: recommendable,
    ownedIds,
    seed,
    limit: 3,
  });

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200 px-4 py-4">
        <div className="mx-auto max-w-2xl font-display text-lg font-bold tracking-tight text-brand">
          DigitalSkillX
        </div>
      </header>
      <Suspense fallback={<p className="p-10 text-center text-sm text-neutral-500">Loading…</p>}>
        <EnrollmentSuccessClient />
      </Suspense>
      {recommendations.length > 0 ? (
        <div className="mx-auto max-w-2xl border-t border-neutral-200 px-4 py-12">
          <RecommendationRail
            title="Explore more"
            subtitle={
              seed?.category_name
                ? "Related programs you don't own yet."
                : "Other programs in the catalog."
            }
            items={recommendations}
          />
        </div>
      ) : null}
    </div>
  );
}
