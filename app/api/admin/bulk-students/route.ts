import { NextResponse, type NextRequest } from "next/server";
import { bulkUploadStudents } from "@/app/(admin)/admin/(panel)/students/actions";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** CSV bulk student import — admin-only JSON API (reliable file upload + fetch clients). */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-bulk-students", 10);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  try {
    const formData = await request.formData();
    const result = await bulkUploadStudents({}, formData);
    if (result.error) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
