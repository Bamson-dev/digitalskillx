import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fetchPublishedCourses } from "@/lib/published-courses";
import { listDigitalProducts } from "@/lib/digital-products";
import { listCourseBundles } from "@/lib/course-bundles";
import { listCommerceOffers } from "@/lib/commerce-offers";
import { isMissingRelationError } from "@/lib/schema-guard";
import { stripHtmlPreview } from "@/lib/announcement-recipients";

function moneyNgn(n: number | null | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "Free / included separately";
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

function oneLine(text: string | null | undefined, max = 220) {
  return stripHtmlPreview(text ?? "", max).replace(/\s+/g, " ").trim();
}

/**
 * Build a catalog snapshot so the Learning Assistant only recommends
 * real DigitalSkillX courses, products, bundles, and offers.
 */
export async function buildAssistantPlatformContext(studentId: string): Promise<string> {
  const admin = await createAdminClientAsync(createClient());

  const [courses, digitalProducts, bundles, offers, enrollments] = await Promise.all([
    fetchPublishedCourses(
      "id, title, short_description, description, price_ngn, instructor_name, is_coming_soon, category:course_categories(name)",
    ).catch((err) => {
      console.error("[assistant-context] courses failed:", err);
      return [];
    }),
    listDigitalProducts(admin).catch((err) => {
      console.error("[assistant-context] digital products failed:", err);
      return [];
    }),
    listCourseBundles(admin).catch((err) => {
      if (err instanceof Error && isMissingRelationError(err.message)) return [];
      console.error("[assistant-context] bundles failed:", err);
      return [];
    }),
    listCommerceOffers(admin, { activeOnly: true }).catch((err) => {
      console.error("[assistant-context] offers failed:", err);
      return [];
    }),
    admin
      .from("enrollments")
      .select("course_id, completed_at, course:courses(id, title)")
      .eq("student_id", studentId)
      .limit(100)
      .then(({ data, error }) => {
        if (error) {
          console.error("[assistant-context] enrollments failed:", error.message);
          return [];
        }
        return data ?? [];
      }),
  ]);

  const courseLines = courses.map((course, index) => {
    const category =
      course.category && typeof course.category === "object" && "name" in course.category
        ? String((course.category as { name?: string }).name ?? "").trim()
        : "";
    const blurb =
      oneLine(course.short_description) || oneLine(course.description, 180) || "No summary listed.";
    const status = course.is_coming_soon ? "Coming soon" : "Available";
    const instructor = course.instructor_name?.trim() ? `; Instructor: ${course.instructor_name.trim()}` : "";
    const cat = category ? `; Category: ${category}` : "";
    return `${index + 1}. "${course.title}" [${status}] — ${moneyNgn(course.price_ngn)}${cat}${instructor}. ${blurb}`;
  });

  const enrolledLines = enrollments.map((row, index) => {
    const course = Array.isArray(row.course) ? row.course[0] : row.course;
    const title =
      course && typeof course === "object" && "title" in course
        ? String((course as { title?: string }).title ?? "Course")
        : "Course";
    const done = row.completed_at ? "completed" : "in progress";
    return `${index + 1}. "${title}" (${done})`;
  });

  const productLines = digitalProducts
    .filter((p) => p.is_active)
    .map((p, index) => {
      const blurb = oneLine(p.description) || "Digital product on the store.";
      return `${index + 1}. "${p.title}" — ${moneyNgn(p.price_ngn)}. ${blurb}`;
    });

  const bundleLines = (bundles ?? [])
    .filter((b) => b.is_active !== false)
    .map((b, index) => {
      const blurb = oneLine(b.description) || "Course bundle on DigitalSkillX.";
      return `${index + 1}. "${b.title}" — ${moneyNgn(b.price_ngn)}. ${blurb}`;
    });

  const offerLines = (offers ?? [])
    .filter((o) => o.is_active)
    .slice(0, 20)
    .map((o, index) => {
      const blurb = oneLine(o.description, 160) || "Live offer on DigitalSkillX.";
      return `${index + 1}. "${o.title}" (${o.offer_type} / ${o.target_type}) — ${moneyNgn(o.price_ngn)}. ${blurb}`;
    });

  const sections = [
    "PLATFORM CATALOG (authoritative — recommend ONLY from this list; never invent courses, paths, or products):",
    courseLines.length > 0
      ? `Published courses (${courseLines.length}):\n${courseLines.join("\n")}`
      : "Published courses: none listed right now.",
    enrolledLines.length > 0
      ? `This student's enrolled courses:\n${enrolledLines.join("\n")}`
      : "This student is not enrolled in any course yet.",
    productLines.length > 0
      ? `Active digital products:\n${productLines.join("\n")}`
      : null,
    bundleLines.length > 0 ? `Active bundles:\n${bundleLines.join("\n")}` : null,
    offerLines.length > 0 ? `Live offers:\n${offerLines.join("\n")}` : null,
  ].filter(Boolean);

  return `\n\n${sections.join("\n\n")}`;
}
