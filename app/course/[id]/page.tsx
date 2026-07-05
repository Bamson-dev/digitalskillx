import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { fetchPublishedCourseById, fetchPublishedCourses, type CatalogCourse, type LandingCourse } from "@/lib/published-courses";
import { isCourseFree } from "@/lib/currency";
import { isSuccessfulGuestPurchase } from "@/lib/guest-checkout";
import { ORG, siteUrl } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseLandingView } from "@/components/marketplace/course-landing-view";
import { PaymentReturnHandler } from "@/components/marketplace/payment-return-handler";

const courseSelect =
  "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, learning_outcomes, instructor_name, instructor_bio, promo_video_url, category:course_categories(name), modules(id, title, position, lessons(id, title, position, lesson_type))";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const course = await fetchPublishedCourseById<{ title: string; short_description: string | null; description: string | null; thumbnail_url: string | null }>(
    params.id,
    "title, short_description, description, thumbnail_url",
  );
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
    Boolean(paymentRef) &&
    (await isSuccessfulGuestPurchase(paymentRef, course.id));

  let isEnrolled = paidPurchaseComplete;
  if (user) {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(supabase);
    const targetStudentId = await syncStudentCourseAccess(admin, {
      authUserId: user.id,
      profileEmail: profile?.email,
    });
    const { data: e } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", targetStudentId)
      .eq("course_id", course.id)
      .maybeSingle();
    isEnrolled = Boolean(e) || paidPurchaseComplete;
  }

  const relatedAll = await fetchPublishedCourses<CatalogCourse>(
    "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name",
  );
  const relatedRaw = relatedAll.filter((c) => c.id !== course.id).slice(0, 2);

  const modules = [...(course.modules ?? [])].sort((a, b) => a.position - b.position);
  const lessonCount = modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0);
  const category = Array.isArray(course.category) ? course.category[0] : course.category;
  const freeEnrollComplete =
    searchParams.enrolled === "1" &&
    !paymentRef &&
    searchParams.payment !== "success" &&
    isCourseFree(course, "NGN");
  const purchaseComplete = !isEnrolled && (paidPurchaseComplete || freeEnrollComplete);

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={profile} />

      <main className="flex-1">
        <Suspense fallback={null}>
          <PaymentReturnHandler
            courseId={course.id}
            courseTitle={course.title}
            userEmail={profile?.email}
            isLoggedIn={Boolean(user)}
          />
        </Suspense>
        <CourseLandingView
          course={{
            ...course,
            learning_outcomes: course.learning_outcomes ?? [],
            modules,
            category_name: category?.name ?? null,
          }}
          isEnrolled={isEnrolled}
          isLoggedIn={Boolean(profile?.email)}
          related={relatedRaw ?? []}
          lessonCount={lessonCount}
          purchaseComplete={purchaseComplete}
        />
      </main>

      <div className="hidden lg:block">
        <MarketplaceFooter />
      </div>
    </div>
  );
}
