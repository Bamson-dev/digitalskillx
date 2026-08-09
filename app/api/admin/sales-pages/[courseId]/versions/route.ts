import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import { listSalesPageVersions } from "@/lib/sales-pages/service";

type Ctx = { params: { courseId: string } };

export async function GET(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-versions", 60);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  const versions = await listSalesPageVersions(auth.admin, params.courseId);
  return NextResponse.json({ versions });
}
