import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { salesPageImportEnabled } from "@/lib/sales-pages/feature-flag";
import { uploadSalesPageImage } from "@/lib/sales-pages/assets";
import { getStorageService } from "@/lib/storage";
import { STORAGE_LIMITS } from "@/lib/storage/limits";

type Ctx = { params: { courseId: string } };

export async function POST(request: Request, { params }: Ctx) {
  if (!salesPageImportEnabled()) {
    return NextResponse.json({ error: "Sales Page feature disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const limited = await rateLimitedResponse(request, "admin-sales-page-asset-upload", 40);
  if (limited) return limited;
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }
    if (file.size > STORAGE_LIMITS.maxFileBytes) {
      return NextResponse.json({ error: "Image exceeds maximum file size." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const storage = getStorageService();
    const result = await uploadSalesPageImage({
      admin: auth.admin,
      storage,
      courseId: params.courseId,
      adminUserId: auth.user.id,
      body: buf,
      originalFilename: file.name || "image.png",
      claimedMime: file.type || undefined,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ assetId: result.id, publicUrl: result.publicUrl });
  } catch (err) {
    console.error("[sales-pages] asset upload failed", err);
    return NextResponse.json({ error: "Asset upload failed." }, { status: 500 });
  }
}
