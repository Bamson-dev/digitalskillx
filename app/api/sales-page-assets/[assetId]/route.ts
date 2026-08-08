import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { getStorageService } from "@/lib/storage";
import { ensureAdminProfileSession } from "@/lib/ensure-admin-profile-session";

type Ctx = { params: { assetId: string } };

/**
 * Controlled asset delivery for Sales Page files stored via StorageService.
 * Public only when the parent sales page is published (or requester is admin for drafts).
 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await bootstrapRuntimeSecrets();
    const session = createClient();
    const admin = await createAdminClientAsync(session);

    const { data: asset } = await admin
      .from("sales_page_assets")
      .select("id, mime_type, storage_path, status, sales_page_id")
      .eq("id", params.assetId)
      .maybeSingle();

    if (!asset || asset.status !== "active") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const { data: page } = await admin
      .from("sales_pages")
      .select("status")
      .eq("id", asset.sales_page_id)
      .maybeSingle();

    if (!page) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (page.status !== "published") {
      const profile = await ensureAdminProfileSession();
      if (!profile || profile.role !== "admin") {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
    }

    const storage = getStorageService();
    const body = await storage.download(asset.storage_path);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": asset.mime_type || "application/octet-stream",
        "Cache-Control": page.status === "published" ? "public, max-age=86400" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[sales-page-assets] serve failed", err);
    return NextResponse.json({ error: "Asset unavailable." }, { status: 500 });
  }
}
