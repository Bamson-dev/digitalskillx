import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { getStorageService } from "@/lib/storage";
import { isMissingRelationError } from "@/lib/schema-guard";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serve mirrored landing-import assets.
 * Published pages: public.
 * Draft/review: admin-authenticated only (prevents draft asset URL guessing).
 */
export async function GET(
  request: NextRequest,
  context: { params: { pageId: string; filename: string } },
) {
  const limited = await rateLimitedResponse(request, "landing-assets-get", 120, 60_000);
  if (limited) return limited;

  const pageId = context.params.pageId;
  const filename = context.params.filename;
  if (!/^[0-9a-f-]{36}$/i.test(pageId) || !/^[a-zA-Z0-9._-]+$/.test(filename) || filename.includes("..")) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const admin = await createAdminClientAsync();
    const { data: page, error: pageErr } = await admin
      .from("imported_landing_pages" as never)
      .select("status")
      .eq("id", pageId)
      .maybeSingle();
    if (pageErr) {
      if (isMissingRelationError(pageErr.message)) {
        return NextResponse.json({ error: "Not found." }, { status: 404 });
      }
      return NextResponse.json({ error: pageErr.message }, { status: 500 });
    }
    if (!page) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const status = String((page as { status: string }).status);
    if (status === "archived" || status === "failed" || status === "importing") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    if (status !== "published") {
      const auth = await requireAdminApiAuth({ lite: true });
      if ("error" in auth) return auth.error;
    }

    const storagePath = `landing-import/${pageId}/${filename}`;
    const { data: asset } = await admin
      .from("imported_landing_page_assets" as never)
      .select("content_type, storage_path, status")
      .eq("page_id", pageId)
      .eq("storage_path", storagePath)
      .eq("status", "active")
      .maybeSingle();
    if (!asset) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const storage = getStorageService();
    const body = await storage.download(storagePath);
    const contentType =
      (asset as { content_type?: string }).content_type || "application/octet-stream";

    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Short TTL so unpublish stops serving quickly through shared caches.
        "Cache-Control":
          status === "published"
            ? "public, max-age=300, must-revalidate"
            : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
