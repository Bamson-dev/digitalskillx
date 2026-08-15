import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { isUuid } from "@/lib/learn-certificate-shared";
import {
  approveAuthorityArticle,
  generateAuthorityArticlesForPath,
  generateAuthorityOpportunitiesForPath,
  listAuthorityOps,
  markStaleAuthorityRefreshProposals,
  publishAuthorityArticle,
  qualifyAuthorityOpportunitiesForPath,
  rejectAuthorityArticle,
} from "@/lib/content-factory/authority-engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-authority", 40);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  try {
    const data = await listAuthorityOps(auth.admin);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load authority queue." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-authority-write", 20);
  if (limited) return limited;
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  const pathId = typeof body.pathId === "string" ? body.pathId.trim() : "";
  const articleId = typeof body.articleId === "string" ? body.articleId.trim() : "";

  try {
    if (action === "generate_opportunities") {
      if (!isUuid(pathId)) {
        return NextResponse.json({ error: "A valid learning path is required." }, { status: 400 });
      }
      const result = await generateAuthorityOpportunitiesForPath(auth.admin, pathId);
      return NextResponse.json(result);
    }
    if (action === "qualify") {
      if (!isUuid(pathId)) {
        return NextResponse.json({ error: "A valid learning path is required." }, { status: 400 });
      }
      const result = await qualifyAuthorityOpportunitiesForPath(auth.admin, pathId, {
        useAi: body.useAi !== false,
      });
      return NextResponse.json(result);
    }
    if (action === "generate") {
      if (!isUuid(pathId)) {
        return NextResponse.json({ error: "A valid learning path is required." }, { status: 400 });
      }
      const articleIds = Array.isArray(body.articleIds)
        ? body.articleIds.filter((id): id is string => typeof id === "string" && isUuid(id))
        : undefined;
      const result = await generateAuthorityArticlesForPath(auth.admin, pathId, {
        articleIds,
        useAi: body.useAi !== false,
      });
      return NextResponse.json(result);
    }
    if (action === "approve") {
      if (!isUuid(articleId)) {
        return NextResponse.json({ error: "A valid article is required." }, { status: 400 });
      }
      const article = await approveAuthorityArticle(auth.admin, articleId);
      return NextResponse.json({ article });
    }
    if (action === "publish") {
      if (!isUuid(articleId)) {
        return NextResponse.json({ error: "A valid article is required." }, { status: 400 });
      }
      const article = await publishAuthorityArticle(auth.admin, articleId);
      return NextResponse.json({ article });
    }
    if (action === "reject") {
      if (!isUuid(articleId)) {
        return NextResponse.json({ error: "A valid article is required." }, { status: 400 });
      }
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      const article = await rejectAuthorityArticle(auth.admin, articleId, reason);
      return NextResponse.json({ article });
    }
    if (action === "retry") {
      if (!isUuid(pathId) || !isUuid(articleId)) {
        return NextResponse.json({ error: "A valid learning path and article are required." }, { status: 400 });
      }
      const result = await generateAuthorityArticlesForPath(auth.admin, pathId, {
        articleIds: [articleId],
        useAi: body.useAi !== false,
      });
      return NextResponse.json(result);
    }
    if (action === "mark_stale") {
      const result = await markStaleAuthorityRefreshProposals(auth.admin);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Authority update failed." },
      { status: 400 },
    );
  }
}
