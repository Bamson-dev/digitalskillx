import { NextResponse, type NextRequest } from "next/server";
import {
  adminApiKeyMatches,
  getAdminApiKey,
  parseManualTrackPurchaseBody,
  runManualTrackPurchase,
} from "@/lib/manual-purchase-tracking";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorizeManualTrack(request: NextRequest) {
  const headerKey = request.headers.get("x-admin-key");
  if (getAdminApiKey() && adminApiKeyMatches(headerKey)) return { ok: true as const };

  const session = await requireAdminApiAuth({ lite: true });
  if (!("error" in session)) return { ok: true as const };

  if (!getAdminApiKey()) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "ADMIN_API_KEY is not configured and no admin session is present." },
        { status: 401 },
      ),
    };
  }
  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeManualTrack(request);
    if (!auth.ok) return auth.response;

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsed = parseManualTrackPurchaseBody(raw);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const result = await runManualTrackPurchase(parsed.value);
    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          stage: result.stage,
        },
        { status: result.stage === "enrollment" ? 422 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      enrolled: true,
      trackingFailed: result.trackingFailed ?? false,
      message: `Student enrolled and purchase tracked successfully for ${parsed.value.email}`,
      warning: result.trackingWarning,
      email: parsed.value.email,
      reference: parsed.value.reference,
      courseId: result.courseId,
      studentId: result.studentId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error." },
      { status: 500 },
    );
  }
}
