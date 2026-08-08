import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import {
  fetchPublishedCourseById,
  fetchPublishedCourses,
  type CatalogCourse,
  type LandingCourse,
} from "@/lib/published-courses";
import { recommendCourses } from "@/lib/recommendations";
import { isCourseFree } from "@/lib/currency";
import { isSuccessfulGuestPurchase } from "@/lib/guest-checkout";
import { ORG, siteUrl } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseLandingView } from "@/components/marketplace/course-landing-view";
import { SalesPageView } from "@/components/marketplace/sales-page-view";
import { CourseComingSoonView } from "@/components/course/course-coming-soon-view";
import { PaymentReturnHandler } from "@/components/marketplace/payment-return-handler";
import { CourseViewTracker } from "@/components/marketplace/course-view-tracker";
import { getPublishedSalesPageForCourse } from "@/lib/sales-pages/service";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";

const courseSelect =
  "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, learning_outcomes, instructor_name, instructor_bio, promo_video_url, is_coming_soon, certificate_enabled, category:course_categories(name), modules(id, title, position, lessons(id, title, position, lesson_type))";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const course = await fetchPublishedCourseById<{
    title: string;
    short_description: string | null;
    description: string | null;
    thumbnail_url: string | null;
  }>(params.id, "title, short_description, description, thumbnail_url");
  if (!course) return { title: "Course" };

  const title = course.title;
  const description = course.short_description ?? course.description ?? ORG.tagline;
  const url = `${siteUrl()}/course/${params.id}`;

  return {
    title,
    description,
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "DigitalSkillX",
      images: course.thumbnail_url ? [{ url: course.thumbnail_url, alt: title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: course.thumbnail_url ? [course.thumbnail_url] : undefined,
    },
  };
}

export default async function CourseLandingPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { enroll?: string; payment?: string; enrolled?: string; ref?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: { full_name: string | null; email: string; role: string } | null = null;
  let isAdmin = false;
  if (user) {
    const { data: p } = await supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single();
    profile = p;
    isAdmin = p?.role === "admin";
  }

  let course: LandingCourse | null = null;
  if (isAdmin) {
    const admin = await getAdminSupabase();
    const { data } = await admin.from("courses").select(courseSelect).eq("id", params.id).single();
    course = data as LandingCourse | null;
  } else {
    course = await fetchPublishedCourseById<LandingCourse>(params.id, courseSelect);
  }

  if (!course) notFound();

  const paymentRef = searchParams.ref?.trim() ?? "";
  const paidPurchaseComplete =
    Boolean(paymentRef) && (await isSuccessfulGuestPurchase(paymentRef, course.id));

  let ownedIds = new Set<string>();
  let isEnrolled = paidPurchaseComplete;
  if (user) {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(supabase);
    let targetStudentId = user.id;
    try {
      targetStudentId = await syncStudentCourseAccess(admin, {
        authUserId: user.id,
        profileEmail: profile?.email,
      });
    } catch (err) {
      console.error("[CourseLandingPage] syncStudentCourseAccess failed", err);
    }
    const { data: e } = await admin
      .from("enrollments")
      .select("id, course_id")
      .eq("student_id", targetStudentId);
    const rows = e ?? [];
    ownedIds = new Set(rows.map((row) => row.course_id));
    isEnrolled = ownedIds.has(course.id) || paidPurchaseComplete;
  }
  if (paidPurchaseComplete) ownedIds.add(course.id);

  const relatedAll = await fetchPublishedCourses<CatalogCourse>(
    "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, is_coming_soon, created_at, category:course_categories(name)",
  );
  const categoryName = (() => {
    const cat = Array.isArray(course.category) ? course.category[0] : course.category;
    return cat?.name ?? null;
  })();
  const related = recommendCourses({
    catalog: relatedAll.map((c) => ({
      ...c,
      category_name: c.category?.name ?? null,
    })),
    ownedIds,
    seed: { id: course.id, title: course.title, category_name: categoryName },
    limit: 3,
  });

  let enrollmentCount: number | null = null;
  try {
    await bootstrapRuntimeSecrets();
    const countAdmin = await createAdminClientAsync(supabase);
    const { count } = await countAdmin
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id);
    enrollmentCount = count ?? null;
  } catch {
    enrollmentCount = null;
  }

  const modules = [...(course.modules ?? [])].sort((a, b) => a.position - b.position);
  const lessonCount = modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0);
  const category = Array.isArray(course.category) ? course.category[0] : course.category;
  const freeEnrollComplete =
    searchParams.enrolled === "1" &&
    !paymentRef &&
    searchParams.payment !== "success" &&
    isCourseFree(course, "NGN");
  const purchaseComplete = !isEnrolled && (paidPurchaseComplete || freeEnrollComplete);

  let publishedSalesPage: Awaited<ReturnType<typeof getPublishedSalesPageForCourse>> = null;
  if (salesPageImportEnabled() && !course.is_coming_soon) {
    try {
      publishedSalesPage = await getPublishedSalesPageForCourse(supabase, course.id);
    } catch {
      publishedSalesPage = null;
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-800">
      <MarketplaceNav user={profile} />

      <main className="flex-1">
        <CourseViewTracker courseId={course.id} />
        <Suspense fallback={null}>
          <PaymentReturnHandler
            courseId={course.id}
            courseTitle={course.title}
            userEmail={profile?.email}
            isLoggedIn={Boolean(user)}
          />
        </Suspense>
        {course.is_coming_soon ? (
          <CourseComingSoonView
            title={course.title}
            description={course.description}
            shortDescription={course.short_description}
            thumbnailUrl={course.thumbnail_url}
            promoVideoUrl={course.promo_video_url}
            learningOutcomes={course.learning_outcomes ?? []}
            categoryName={category?.name ?? null}
            instructorName={course.instructor_name}
          />
        ) : publishedSalesPage ? (
          <SalesPageView
            course={{
              ...course,
              learning_outcomes: course.learning_outcomes ?? [],
              modules,
            }}
            schema={publishedSalesPage.schema}
            isEnrolled={isEnrolled}
            isLoggedIn={Boolean(profile?.email)}
            related={related}
          />
        ) : (
          <CourseLandingView
            course={{
              ...course,
              learning_outcomes: course.learning_outcomes ?? [],
              modules,
              category_name: category?.name ?? null,
              certificate_enabled: course.certificate_enabled ?? false,
            }}
            isEnrolled={isEnrolled}
            isLoggedIn={Boolean(profile?.email)}
            related={related}
            lessonCount={lessonCount}
            enrollmentCount={enrollmentCount}
            purchaseComplete={purchaseComplete}
          />
        )}
      </main>

      <div className="hidden lg:block">
        <MarketplaceFooter />
      </div>
    </div>
  );
}
