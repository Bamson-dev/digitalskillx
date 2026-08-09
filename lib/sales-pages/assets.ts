import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";
import { STORAGE_LIMITS, ALLOWED_IMAGE_MIME } from "../storage/limits";
import { sniffImageMime, uniqueStorageFilename } from "../storage/path-safety";
import type { StorageService } from "../storage/types";
import { getOrCreateSalesPage, getSalesPageByCourseId } from "./service";

export async function uploadSalesPageImage(params: {
  admin: SupabaseClient<Database>;
  storage: StorageService;
  courseId: string;
  adminUserId: string;
  body: Buffer;
  originalFilename: string;
  claimedMime?: string;
}): Promise<{ id: string; publicUrl: string } | { error: string }> {
  const sniffed = sniffImageMime(params.body);
  const mime = sniffed ?? params.claimedMime ?? "";
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return { error: "Only JPEG, PNG, WebP, or GIF images are allowed." };
  }
  if (params.body.length > STORAGE_LIMITS.maxFileBytes) {
    return { error: "Image exceeds maximum file size." };
  }

  const page = await getOrCreateSalesPage(params.admin, params.courseId, params.adminUserId);
  const extFromMime =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : "gif";
  const { filename } = uniqueStorageFilename(
    params.originalFilename || `image.${extFromMime}`,
    new Set(["jpg", "jpeg", "png", "webp", "gif"]),
  );
  const assetId = randomUUID();
  const storagePath = `sales-page-assets/${params.courseId}/${assetId}-${filename}`;
  const uploaded = await params.storage.upload({
    path: storagePath,
    body: params.body,
    contentType: mime,
    isPublic: true,
  });

  const publicUrl = `/api/sales-page-assets/${assetId}`;
  const { error } = await params.admin.from("sales_page_assets").insert({
    id: assetId,
    sales_page_id: page.id,
    course_id: params.courseId,
    filename,
    original_filename: params.originalFilename || filename,
    mime_type: mime,
    size_bytes: uploaded.size,
    storage_provider: uploaded.provider,
    storage_path: uploaded.path,
    public_url: publicUrl,
    checksum: uploaded.checksumSha256,
    source_url: null,
    status: "active",
  } as never);

  if (error) {
    try {
      await params.storage.delete(uploaded.path);
    } catch {
      /* best-effort */
    }
    return { error: "Failed to save asset metadata." };
  }
  return { id: assetId, publicUrl };
}

export async function deleteSalesPageAsset(params: {
  admin: SupabaseClient<Database>;
  storage: StorageService;
  courseId: string;
  assetId: string;
}): Promise<{ ok: true } | { error: string }> {
  const page = await getSalesPageByCourseId(params.admin, params.courseId);
  if (!page) return { error: "Sales page not found." };

  const { data: asset } = await params.admin
    .from("sales_page_assets")
    .select("id, storage_path, sales_page_id")
    .eq("id", params.assetId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (!asset || asset.sales_page_id !== page.id) {
    return { error: "Asset not found." };
  }

  try {
    await params.storage.delete(String(asset.storage_path));
  } catch {
    /* continue to mark deleted */
  }

  await params.admin
    .from("sales_page_assets")
    .update({ status: "deleted", updated_at: new Date().toISOString() } as never)
    .eq("id", params.assetId);

  return { ok: true };
}
