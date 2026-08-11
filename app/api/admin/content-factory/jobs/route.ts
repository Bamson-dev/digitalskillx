import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { createContentFactoryJob, listContentFactoryJobs } from "@/lib/content-factory/jobs";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import type { ContentFactoryInputType } from "@/lib/content-factory/shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  try {
    const jobs = await listContentFactoryJobs(auth.admin);
    return NextResponse.json({ jobs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list jobs" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "content-factory-jobs", 20);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: { inputType?: ContentFactoryInputType; inputValue?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.inputType || !body.inputValue?.trim()) {
    return NextResponse.json({ error: "inputType and inputValue are required." }, { status: 400 });
  }
  if (!["topic", "playlist_url", "playlist_id"].includes(body.inputType)) {
    return NextResponse.json({ error: "Invalid inputType." }, { status: 400 });
  }

  try {
    const job = await createContentFactoryJob(auth.admin, {
      adminId: auth.user.id,
      inputType: body.inputType,
      inputValue: body.inputValue,
    });
    return NextResponse.json({ job });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create job" },
      { status: 400 },
    );
  }
}
