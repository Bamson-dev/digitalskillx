import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import { deleteSalesPageAsset } from "@/lib/sales-pages/assets";
import { getStorageService } from "@/lib/storage";

type Ctx = { params: { courseId: string; assetId: string } };

export async function DELETE(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-asset-delete", 40);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  try {
    const storage = getStorageService();
    const result = await deleteSalesPageAsset({
      admin: auth.admin,
      storage,
      courseId: params.courseId,
      assetId: params.assetId,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[sales-pages] asset delete failed", err);
    return NextResponse.json({ error: "Could not delete asset." }, { status: 500 });
  }
}
