import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  applyLearningPathSeoSuggestion,
  approveLearningPathSeoSuggestion,
  listSeoGrowthQueue,
  rejectLearningPathSeoSuggestion,
  suggestLearningPathSeo,
} from "@/lib/content-factory/seo-engine";
import { isUuid } from "@/lib/learn-certificate-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-seo-growth", 40);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  try {
    const data = await listSeoGrowthQueue(auth.admin);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load SEO queue." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-seo-growth-write", 20);
  if (limited) return limited;
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const pathId = typeof body.pathId === "string" ? body.pathId.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!isUuid(pathId)) {
    return NextResponse.json({ error: "A valid learning path is required." }, { status: 400 });
  }

  try {
    if (action === "suggest") {
      const result = await suggestLearningPathSeo(auth.admin, pathId, {
        useAi: body.useAi !== false,
      });
      return NextResponse.json(result);
    }
    if (action === "approve") {
      const path = await approveLearningPathSeoSuggestion(auth.admin, pathId);
      return NextResponse.json({ path });
    }
    if (action === "apply") {
      const path = await applyLearningPathSeoSuggestion(auth.admin, pathId);
      return NextResponse.json({ path });
    }
    if (action === "approve_and_apply") {
      await approveLearningPathSeoSuggestion(auth.admin, pathId);
      const path = await applyLearningPathSeoSuggestion(auth.admin, pathId);
      return NextResponse.json({ path });
    }
    if (action === "reject") {
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      const path = await rejectLearningPathSeoSuggestion(auth.admin, pathId, reason);
      return NextResponse.json({ path });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "SEO update failed." },
      { status: 400 },
    );
  }
}
