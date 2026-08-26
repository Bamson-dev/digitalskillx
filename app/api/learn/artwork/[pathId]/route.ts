import { NextResponse } from "next/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { getStorageService } from "@/lib/storage";
import { isUuid } from "@/lib/learn-certificate-shared";

type Ctx = { params: { pathId: string } };

/**
 * Public cover delivery for Learn paths whose Contabo public base URL is unset.
 * Serves stored OpenAI artwork for published (or review) paths only.
 */
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await bootstrapRuntimeSecrets();
    if (!isUuid(params.pathId)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const admin = await createAdminClientAsync();
    const { data: path } = await admin
      .from("learning_paths")
      .select("id, status, artwork_storage_path")
      .eq("id", params.pathId)
      .maybeSingle();

    if (!path?.artwork_storage_path) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    if (path.status !== "published" && path.status !== "review") {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const storage = getStorageService();
    const body = await storage.download(path.artwork_storage_path);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control":
          path.status === "published" ? "public, max-age=86400" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[learn-artwork] serve failed", err);
    return NextResponse.json({ error: "Artwork unavailable." }, { status: 500 });
  }
}
