import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import {
  listLearningPathCertificateOps,
  saveLearningPathCertificateOffer,
} from "@/lib/learn-certificate-admin";
import { isUuid } from "@/lib/learn-certificate-shared";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-path-cert-offers", 60);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  try {
    const data = await listLearningPathCertificateOps(auth.admin);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load certificate offers." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-path-cert-offers-write", 30);
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
  if (!isUuid(pathId)) {
    return NextResponse.json({ error: "A valid learning path is required." }, { status: 400 });
  }

  try {
    const result = await saveLearningPathCertificateOffer(auth.admin, pathId, body);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ path: result.path });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save certificate offer." },
      { status: 400 },
    );
  }
}
