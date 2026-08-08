import type { Metadata } from "next";
import { Suspense } from "react";
import { EnrollmentSuccessClient } from "@/components/enrollment/enrollment-success-client";
import { RecommendationRail } from "@/components/marketplace/recommendation-rail";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { recommendCourses } from "@/lib/recommendations";

export const metadata: Metadata = { title: "Welcome" };

export default async function EnrollmentSuccessPage() {
  const catalog = await fetchPublishedCourses<CatalogCourse>(
    "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, is_coming_soon, category:course_categories(name)",
  );
  const recommendations = recommendCourses({
    catalog: catalog.map((c) => ({
      ...c,
      category_name: c.category?.name ?? null,
    })),
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
            subtitle="Other programs in the catalog."
            items={recommendations}
          />
        </div>
      ) : null}
    </div>
  );
}
