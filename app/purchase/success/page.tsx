import type { Metadata } from "next";
import Link from "next/link";
import { RecommendationRail } from "@/components/marketplace/recommendation-rail";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { recommendCourses, type CourseRecommendation } from "@/lib/recommendations";
import { getCourseRecommendationsForDisplay } from "@/lib/course-recommendations";

export const metadata: Metadata = { title: "Purchase confirmed" };
export const dynamic = "force-dynamic";

export default async function PurchaseSuccessPage({
  searchParams,
}: {
  searchParams?: {
    courseId?: string;
    reference?: string;
    payment?: string;
  };
}) {
  const courseId = searchParams?.courseId?.trim() || null;
  const reference = searchParams?.reference?.trim() || null;

  const ownedIds = new Set<string>();
  let seed: { id: string; title: string; category_name: string | null } | null = null;
  let recommendations: CourseRecommendation[] = [];
  let courseTitle: string | null = null;
  let accessHref = "/dashboard";

  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let recommendable: Array<CatalogCourse & { category_name: string | null }> = [];
    try {
      const catalog = await fetchPublishedCourses<CatalogCourse>(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, is_coming_soon, category:course_categories(name)",
      );
      recommendable = catalog.map((c) => ({
        ...c,
        category_name: c.category?.name ?? null,
      }));
    } catch (err) {
      console.error("[PurchaseSuccessPage] catalog fetch failed", err);
    }

    if (courseId) {
      const match = recommendable.find((c) => c.id === courseId);
      courseTitle = match?.title ?? null;
      accessHref = `/courses/${courseId}`;
      seed = match
        ? { id: match.id, title: match.title, category_name: match.category_name }
        : { id: courseId, title: "Your course", category_name: null };
    }

    if (user) {
      try {
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
          console.error("[PurchaseSuccessPage] syncStudentCourseAccess failed", err);
        }

        const { data: enrollments } = await admin
          .from("enrollments")
          .select("course_id, enrolled_at")
          .eq("student_id", studentId)
          .order("enrolled_at", { ascending: false });

        for (const row of enrollments ?? []) {
          ownedIds.add(row.course_id);
        }

        if (!seed) {
          const latestId = enrollments?.[0]?.course_id;
          if (latestId) {
            const latest = recommendable.find((c) => c.id === latestId);
            if (latest) {
              seed = {
                id: latest.id,
                title: latest.title,
                category_name: latest.category_name,
              };
              courseTitle = latest.title;
              accessHref = `/courses/${latest.id}`;
            }
          }
        }

        if (courseId && !courseTitle) {
          const { data: course } = await admin
            .from("courses")
            .select("title")
            .eq("id", courseId)
            .maybeSingle();
          courseTitle = course?.title ?? null;
        }
      } catch (err) {
        console.error("[PurchaseSuccessPage] user enrichment failed", err);
      }
    }

    recommendations = recommendCourses({
      catalog: recommendable,
      ownedIds,
      seed,
      limit: 3,
    });

    if (seed) {
      try {
        await bootstrapRuntimeSecrets();
        const admin = await createAdminClientAsync(supabase);
        recommendations = await getCourseRecommendationsForDisplay(admin, {
          courseId: seed.id,
          catalog: recommendable,
          ownedIds,
          kind: ["upsell", "cross_sell", "related", "next_step"],
          limit: 3,
        });
      } catch {
        /* heuristic fallback already set */
      }
    }
  } catch (err) {
    console.error("[PurchaseSuccessPage] unexpected", err);
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-neutral-200 px-4 py-4">
        <div className="mx-auto max-w-2xl font-display text-lg font-bold tracking-tight text-brand">
          DigitalSkillX
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-14 sm:py-16">
        <p className="text-sm font-semibold text-brand">Purchase confirmed</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950">
          You&apos;re all set
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-neutral-600">
          {courseTitle ? (
            <>
              <strong>{courseTitle}</strong> is unlocked on your account. Open it anytime from your
              dashboard.
            </>
          ) : (
            <>Your purchase went through. Access your learning from your dashboard.</>
          )}
        </p>

        {!reference ? (
          <p className="mt-4 text-sm text-neutral-500">
            If you just paid, your access may take a moment to appear. Refresh or open your courses
            shortly.
          </p>
        ) : (
          <p className="mt-4 text-xs text-neutral-400">
            Reference: <code className="rounded bg-neutral-100 px-1.5 py-0.5">{reference}</code>
          </p>
        )}

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href={accessHref}
            className="inline-flex h-12 min-h-[48px] items-center justify-center bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {courseId ? "Start learning" : "Go to dashboard"}
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-12 min-h-[48px] items-center justify-center border border-neutral-200 px-6 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {recommendations.length > 0 ? (
        <div className="mx-auto max-w-2xl border-t border-neutral-200 px-4 py-12">
          <RecommendationRail
            title="Recommended next program"
            subtitle={
              seed?.category_name
                ? "Related programs you don't own yet."
                : "Other programs in the catalog."
            }
            items={recommendations}
            trackAs="upsell"
            seedCourseId={seed?.id}
          />
        </div>
      ) : null}
    </div>
  );
}
