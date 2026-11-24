import { NextResponse, type NextRequest } from "next/server";
import { createStorageApi, publicBuckets, verifyStorageToken } from "@/lib/db/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif)|application\/pdf|video\/|audio\/)/i;

/**
 * Serves stored files.
 *   - Buckets listed in STORAGE_PUBLIC_BUCKETS (default: public-assets) are readable by anyone.
 *   - Every other bucket needs a signed link (?exp=...&token=...) made by createSignedUrl.
 */
export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const segments = (params.path ?? []).map((s) => decodeURIComponent(s));
  const [bucket, ...rest] = segments;
  const objectPath = rest.join("/");
  if (!bucket || !objectPath) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!publicBuckets().includes(bucket)) {
    const exp = Number(request.nextUrl.searchParams.get("exp"));
    const token = request.nextUrl.searchParams.get("token") ?? "";
    let ok = false;
    try {
      ok = verifyStorageToken(bucket, objectPath, exp, token);
    } catch {
      ok = false;
    }
    if (!ok) return NextResponse.json({ error: "Link expired or invalid" }, { status: 403 });
  }

  const { data, error } = await createStorageApi().from(bucket).download(objectPath);
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const type = data.type || "application/octet-stream";
  const inline = INLINE_TYPES.test(type);
  const filename = objectPath.split("/").pop() ?? "file";
  return new NextResponse(data, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'",
      "Cache-Control": publicBuckets().includes(bucket) ? "public, max-age=3600" : "private, max-age=60",
    },
  });
}
