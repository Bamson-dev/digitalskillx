import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingColumnError } from "@/lib/schema-guard";
import { filterStorefrontCourses } from "@/lib/storefront-visibility";
import {
  parseCertificateOfferPatch,
  recommendedCourseIsSelectable,
  type CertificateOfferPatch,
  type LearningPathCertificateMetrics,
  type LearningPathCertificateRow,
  type PublishedCourseOption,
} from "@/lib/learn-certificate-shared";
import { revalidatePath } from "next/cache";

export type {
  LearningPathCertificateMetrics,
  LearningPathCertificateRow,
  PublishedCourseOption,
};

type Admin = SupabaseClient<Database>;

export async function listPublishedCoursesForRecommendation(
  admin: Admin,
): Promise<PublishedCourseOption[]> {
  const { data, error } = await admin
    .from("courses")
    .select("id, title, price_ngn, visibility")
    .eq("visibility", "published")
    .order("title", { ascending: true });
  if (error) throw new Error(error.message);
  return filterStorefrontCourses((data ?? []) as PublishedCourseOption[]).filter(
    (course) => course.visibility === "published" && Boolean(course.title?.trim()),
  );
}

export async function saveLearningPathCertificateOffer(
  admin: Admin,
  pathId: string,
  rawPatch: unknown,
) {
  const parsed = parseCertificateOfferPatch(rawPatch);
  if (!parsed.ok) return { error: parsed.error, status: 400 as const };

  const { data: path, error: pathError } = await admin
    .from("learning_paths")
    .select("id, slug, status")
    .eq("id", pathId)
    .maybeSingle();
  if (pathError) {
    if (isMissingColumnError(pathError.message)) {
      return {
        error: "Learning path certificates are not enabled on this database yet.",
        status: 503 as const,
      };
    }
    throw new Error(pathError.message);
  }
  if (!path) return { error: "Learning path not found.", status: 404 as const };
  if (parsed.value.recommended_course_id === pathId) {
    return { error: "A learning path cannot recommend itself.", status: 400 as const };
  }

  const courses = await listPublishedCoursesForRecommendation(admin);
  if (
    !recommendedCourseIsSelectable({
      courseId: parsed.value.recommended_course_id,
      publishedCourseIds: courses.map((course) => course.id),
    })
  ) {
    return { error: "Recommended course must be a published DigitalSkillX course.", status: 400 as const };
  }

  const update: CertificateOfferPatch & { updated_at: string } = {
    ...parsed.value,
    updated_at: new Date().toISOString(),
  };

  const result = await admin
    .from("learning_paths")
    .update({
      certificate_enabled: update.certificate_enabled,
      certificate_price_ngn: update.certificate_price_ngn,
      recommended_course_id: update.recommended_course_id,
      certificate_template_override: update.certificate_template_override,
      updated_at: update.updated_at,
    })
    .eq("id", pathId)
    .select(
      "id, title, slug, status, certificate_enabled, certificate_price_ngn, recommended_course_id, certificate_template_override",
    )
    .single();

  if (result.error) {
    if (isMissingColumnError(result.error.message)) {
      return {
        error: "Learning path certificates are not enabled on this database yet.",
        status: 503 as const,
      };
    }
    throw new Error(result.error.message);
  }

  revalidatePath("/learn");
  revalidatePath(`/learn/${path.slug}`);
  return { path: result.data, status: 200 as const };
}

export async function listLearningPathCertificateOps(admin: Admin): Promise<{
  paths: LearningPathCertificateRow[];
  courses: PublishedCourseOption[];
  metrics: LearningPathCertificateMetrics;
}> {
  const courses = await listPublishedCoursesForRecommendation(admin);
  const courseTitle = new Map(courses.map((course) => [course.id, course.title]));

  const pathsQuery = await admin
    .from("learning_paths")
    .select(
      "id, title, slug, status, certificate_enabled, certificate_price_ngn, recommended_course_id, certificate_template_override",
    )
    .in("status", ["published", "review", "draft"])
    .order("updated_at", { ascending: false })
    .limit(80);

  if (pathsQuery.error) {
    if (isMissingColumnError(pathsQuery.error.message)) {
      return {
        paths: [],
        courses,
        metrics: emptyMetrics(),
      };
    }
    throw new Error(pathsQuery.error.message);
  }

  const paths = (pathsQuery.data ?? []) as Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    certificate_enabled?: boolean | null;
    certificate_price_ngn?: number | null;
    recommended_course_id?: string | null;
    certificate_template_override?: string | null;
  }>;

  const issuedByPath = new Map<string, number>();
  const certsQuery = await admin
    .from("certificates")
    .select("id, learning_path_id, is_valid")
    .not("learning_path_id", "is", null)
    .eq("is_valid", true)
    .limit(2000);
  if (!certsQuery.error) {
    for (const row of certsQuery.data ?? []) {
      const pathId = (row as { learning_path_id?: string | null }).learning_path_id;
      if (!pathId) continue;
      issuedByPath.set(pathId, (issuedByPath.get(pathId) ?? 0) + 1);
    }
  } else if (!isMissingColumnError(certsQuery.error.message)) {
    throw new Error(certsQuery.error.message);
  }

  const metrics = await loadCertificateMetrics(admin, new Map(paths.map((path) => [path.id, path.title])));

  return {
    courses,
    metrics,
    paths: paths.map((path) => ({
      id: path.id,
      title: path.title,
      slug: path.slug,
      status: path.status,
      certificate_enabled: path.certificate_enabled === true,
      certificate_price_ngn: path.certificate_price_ngn ?? null,
      recommended_course_id: path.recommended_course_id ?? null,
      recommended_course_title: path.recommended_course_id
        ? courseTitle.get(path.recommended_course_id) ?? null
        : null,
      certificate_template_override: path.certificate_template_override ?? null,
      certificates_issued: issuedByPath.get(path.id) ?? 0,
    })),
  };
}

function emptyMetrics(): LearningPathCertificateMetrics {
  return {
    certificatesIssued: 0,
    certificateRevenueNgn: 0,
    averageCertificateValueNgn: 0,
    recent: [],
  };
}

async function loadCertificateMetrics(
  admin: Admin,
  pathTitles: Map<string, string>,
): Promise<LearningPathCertificateMetrics> {
  const metrics = emptyMetrics();
  const [countQuery, recentQuery, txQuery] = await Promise.all([
    admin
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .not("learning_path_id", "is", null)
      .eq("is_valid", true),
    admin
      .from("certificates")
      .select("id, certificate_number, issued_at, learning_path_id")
      .not("learning_path_id", "is", null)
      .eq("is_valid", true)
      .order("issued_at", { ascending: false })
      .limit(8),
    admin
      .from("transactions")
      .select("amount, status, learning_path_id")
      .not("learning_path_id", "is", null)
      .eq("status", "success")
      .limit(2000),
  ]);

  if (countQuery.error && !isMissingColumnError(countQuery.error.message)) {
    throw new Error(countQuery.error.message);
  }
  if (recentQuery.error && !isMissingColumnError(recentQuery.error.message)) {
    throw new Error(recentQuery.error.message);
  }
  if (txQuery.error && !isMissingColumnError(txQuery.error.message)) {
    throw new Error(txQuery.error.message);
  }

  if (typeof countQuery.count === "number") metrics.certificatesIssued = countQuery.count;
  metrics.recent = ((recentQuery.data ?? []) as Array<{
    id: string;
    certificate_number: string;
    issued_at: string;
    learning_path_id?: string | null;
  }>).map((row) => ({
    id: row.id,
    certificate_number: row.certificate_number,
    issued_at: row.issued_at,
    learning_path_title: (row.learning_path_id && pathTitles.get(row.learning_path_id)) || "Learning path",
  }));

  const paid = (txQuery.data ?? []) as Array<{ amount: number | null }>;
  const kobo = paid.reduce((sum, row) => sum + (typeof row.amount === "number" ? row.amount : 0), 0);
  metrics.certificateRevenueNgn = Math.round(kobo / 100);
  metrics.averageCertificateValueNgn = paid.length
    ? Math.round(metrics.certificateRevenueNgn / paid.length)
    : 0;
  return metrics;
}
