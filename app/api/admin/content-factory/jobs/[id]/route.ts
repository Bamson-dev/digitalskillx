import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import {
  getContentFactoryJob,
  retryFailedContentFactoryJob,
} from "@/lib/content-factory/jobs";
import { syncCandidatesForJob } from "@/lib/content-factory/generate";
import { loadCreatorResearchBundle } from "@/lib/content-factory/creator-research";
import {
  approveLearningPath,
  getLearningPathById,
  loadLearningPathCurriculum,
  rejectLearningPath,
} from "@/lib/content-factory/learning-paths";
import type { LearningPath } from "@/types/database";
import { isMissingColumnError } from "@/lib/schema-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: { id: string } };

export async function GET(_request: NextRequest, { params }: Ctx) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const job = await getContentFactoryJob(auth.admin, params.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  let path = null;
  let curriculum = null;
  let creator = null;
  let creatorSources: unknown[] = [];
  let creatorQualityScore: number | null = null;
  if (job.learning_path_id) {
    path = await getLearningPathById(auth.admin, job.learning_path_id);
    curriculum = await loadLearningPathCurriculum(auth.admin, job.learning_path_id);
    if (path?.creator_profile_id) {
      const bundle = await loadCreatorResearchBundle(auth.admin, path.creator_profile_id);
      creator = bundle?.profile ?? null;
      creatorSources = bundle?.sources ?? [];
      creatorQualityScore = bundle?.qualityScore ?? null;
    }
  }

  return NextResponse.json({ job, path, curriculum, creator, creatorSources, creatorQualityScore });
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const job = await getContentFactoryJob(auth.admin, params.id);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  let body: {
    action?: "approve" | "reject" | "save_draft" | "retry";
    reason?: string;
    patch?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    if (body.action === "retry") {
      const retried = await retryFailedContentFactoryJob(auth.admin, params.id);
      await syncCandidatesForJob(auth.admin, params.id);
      return NextResponse.json({ job: retried });
    }

    if (!job.learning_path_id) {
      return NextResponse.json({ error: "No learning path ready for this job." }, { status: 400 });
    }

    if (body.action === "approve") {
      const path = await approveLearningPath(auth.admin, job.learning_path_id);
      await syncCandidatesForJob(auth.admin, params.id);
      return NextResponse.json({ path });
    }
    if (body.action === "reject") {
      const path = await rejectLearningPath(auth.admin, job.learning_path_id, body.reason);
      await syncCandidatesForJob(auth.admin, params.id);
      return NextResponse.json({ path });
    }
    if (body.action === "save_draft") {
      const patch = body.patch ?? {};
      const update: Partial<LearningPath> = {
        status: "draft",
        updated_at: new Date().toISOString(),
      };
      if (typeof patch.title === "string") update.title = patch.title;
      if (typeof patch.description === "string") update.description = patch.description;
      if (typeof patch.short_description === "string") update.short_description = patch.short_description;
      if (typeof patch.category === "string") update.category = patch.category;
      if (patch.difficulty === "beginner" || patch.difficulty === "intermediate" || patch.difficulty === "advanced") {
        update.difficulty = patch.difficulty;
      }
      if (Array.isArray(patch.tags)) update.tags = patch.tags.filter((x): x is string => typeof x === "string");
      if (Array.isArray(patch.learning_objectives)) {
        update.learning_objectives = patch.learning_objectives.filter((x): x is string => typeof x === "string");
      }
      if (typeof patch.seo_title === "string") update.seo_title = patch.seo_title;
      if (typeof patch.seo_description === "string") update.seo_description = patch.seo_description;
      if (typeof patch.certificate_enabled === "boolean") update.certificate_enabled = patch.certificate_enabled;
      if (patch.certificate_price_ngn === null) update.certificate_price_ngn = null;
      if (typeof patch.certificate_price_ngn === "number" && patch.certificate_price_ngn >= 0) {
        update.certificate_price_ngn = Math.round(patch.certificate_price_ngn);
      }
      if (patch.recommended_course_id === null) update.recommended_course_id = null;
      if (typeof patch.recommended_course_id === "string" && patch.recommended_course_id.trim()) {
        update.recommended_course_id = patch.recommended_course_id.trim();
      }

      let result = await auth.admin
        .from("learning_paths")
        .update(update)
        .eq("id", job.learning_path_id)
        .select("*")
        .single();
      if (result.error && isMissingColumnError(result.error.message)) {
        const fallback = { ...update };
        delete fallback.certificate_enabled;
        delete fallback.certificate_price_ngn;
        delete fallback.recommended_course_id;
        result = await auth.admin
          .from("learning_paths")
          .update(fallback)
          .eq("id", job.learning_path_id)
          .select("*")
          .single();
      }
      if (result.error) throw new Error(result.error.message);
      return NextResponse.json({ path: result.data });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 },
    );
  }
}
