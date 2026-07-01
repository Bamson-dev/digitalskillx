import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_BYTES = 2 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function extFromFile(file: File) {
  const byType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/x-icon": "ico",
    "image/vnd.microsoft.icon": "ico",
  };
  return byType[file.type] ?? "bin";
}

/** Upload a branding asset to the public-assets bucket; returns public URL. */
export async function uploadPublicAsset(file: File, folder: string) {
  if (file.size <= 0) return null;
  if (file.size > MAX_BYTES) {
    throw new Error("File must be 2 MB or smaller.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Upload a PNG, JPG, WebP, SVG, or ICO image.");
  }

  const admin = createAdminClient();
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${extFromFile(file)}`;
  const body = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from("public-assets").upload(path, body, {
    upsert: true,
    contentType: file.type,
  });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from("public-assets").getPublicUrl(path);
  return data.publicUrl;
}
