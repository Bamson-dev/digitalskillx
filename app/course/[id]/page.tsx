import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ORG, siteUrl } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseLandingView } from "@/components/marketplace/course-landing-view";
import { PaymentReturnHandler } from "@/components/marketplace/payment-return-handler";

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const supabase = createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("title, short_description, description, thumbnail_url")
    .eq("id", params.id)
    .eq("visibility", "published")
    .maybeSingle();
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
  searchParams: { enroll?: string; payment?: string; enrolled?: string };
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

  let courseQuery = supabase
    .from("courses")
    .select(
      "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, learning_outcomes, instructor_name, instructor_bio, promo_video_url, category:course_categories(name), modules(id, title, position, lessons(id, title, position, lesson_type))",
    )
    .eq("id", params.id);

  if (!isAdmin) {
    courseQuery = courseQuery.eq("visibility", "published");
  }

  const { data: course } = await courseQuery.single();

  if (!course) notFound();

  let isEnrolled = false;
  if (user) {
    const { data: e } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();
    isEnrolled = Boolean(e);
  }

  const { data: relatedRaw } = await supabase
    .from("courses")
    .select("id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name")
    .eq("visibility", "published")
    .neq("id", course.id)
    .limit(2);

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

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={profile} />

      <main className="flex-1">
        <Suspense fallback={null}>
          <PaymentReturnHandler
            courseId={course.id}
            courseTitle={course.title}
            userEmail={profile?.email}
          />
        </Suspense>
        <CourseLandingView
          course={{
            ...course,
            modules,
            category_name: category?.name ?? null,
          }}
          isEnrolled={isEnrolled}
          isLoggedIn={Boolean(user)}
          related={relatedRaw ?? []}
          lessonCount={lessonCount}
          enrollmentCount={enrollmentCount}
        />
      </main>

      <div className="hidden lg:block">
        <MarketplaceFooter />
      </div>
    </div>
  );
}
