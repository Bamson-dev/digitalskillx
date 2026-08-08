import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../types/database";
import { detectWordPressFormat } from "./detect-format";
import {
  adaptBricks,
  adaptDigitalSkillX,
  adaptElementor,
  adaptGeneric,
  adaptGutenberg,
  type AdapterResult,
} from "./adapters";
import { downloadExternalAsset } from "./ssrf";
import { extractSalesPageZip } from "./zip";
import type { ImportReport, SalesPageSchema, SalesPageSection } from "../types";
import { STORAGE_LIMITS, ALLOWED_IMAGE_MIME, ALLOWED_RESOURCE_MIME } from "../../storage/limits";
import { sniffImageMime, uniqueStorageFilename } from "../../storage/path-safety";
import type { StorageService } from "../../storage/types";
import { getOrCreateSalesPage } from "../service";

function runAdapter(format: string, payload: unknown): AdapterResult {
  switch (format) {
    case "digitalskillx":
      return adaptDigitalSkillX(payload);
    case "elementor":
      return adaptElementor(payload);
    case "gutenberg":
      return adaptGutenberg(payload);
    case "bricks":
      return adaptBricks(payload);
    case "generic":
      return adaptGeneric(payload);
    default:
      throw new Error("UNSUPPORTED_FORMAT");
  }
}

async function storeAsset(params: {
  admin: SupabaseClient<Database>;
  storage: StorageService;
  salesPageId: string;
  courseId: string;
  body: Buffer;
  originalFilename: string;
  claimedMime?: string;
  sourceUrl?: string | null;
}): Promise<{ id: string; publicUrl: string } | { error: string }> {
  const sniffed = sniffImageMime(params.body);
  const mime = sniffed ?? params.claimedMime ?? "application/octet-stream";
  if (!ALLOWED_RESOURCE_MIME.has(mime) && !ALLOWED_IMAGE_MIME.has(mime)) {
    return { error: `Unsupported MIME type: ${mime}` };
  }
  if (params.body.length > STORAGE_LIMITS.maxFileBytes) {
    return { error: "Asset exceeds maximum file size." };
  }

  const extFromMime =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : mime === "image/gif"
            ? "gif"
            : mime === "application/pdf"
              ? "pdf"
              : "bin";
  const { filename } = uniqueStorageFilename(
    params.originalFilename || `asset.${extFromMime}`,
    new Set(["jpg", "jpeg", "png", "webp", "gif", "pdf"]),
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
    sales_page_id: params.salesPageId,
    course_id: params.courseId,
    filename,
    original_filename: params.originalFilename || filename,
    mime_type: mime,
    size_bytes: uploaded.size,
    storage_provider: uploaded.provider,
    storage_path: uploaded.path,
    public_url: publicUrl,
    checksum: uploaded.checksumSha256,
    source_url: params.sourceUrl ?? null,
    status: "active",
  } as never);

  if (error) {
    try {
      await params.storage.delete(uploaded.path);
    } catch {
      /* orphan cleanup best-effort */
    }
    return { error: "Failed to save asset metadata." };
  }
  return { id: assetId, publicUrl };
}

function bindImageSections(
  schema: SalesPageSchema,
  assetIds: string[],
): SalesPageSchema {
  let i = 0;
  const sections = schema.sections.map((section) => {
    if (section.type === "image" && !section.assetId && assetIds[i]) {
      return { ...section, assetId: assetIds[i++] };
    }
    if (section.type === "hero" && !section.imageAssetId && assetIds[i]) {
      return { ...section, imageAssetId: assetIds[i++] };
    }
    return section;
  });
  return { ...schema, sections };
}

export async function importSalesPageJson(params: {
  admin: SupabaseClient<Database>;
  storage: StorageService;
  courseId: string;
  courseTitle?: string;
  adminUserId: string;
  payload: unknown;
  fetchImpl?: typeof fetch;
}): Promise<{ report: ImportReport; salesPageId: string }> {
  const format = detectWordPressFormat(params.payload);
  if (format === "unsupported") {
    const report: ImportReport = {
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      sourceType: "json",
      sourceFormat: "unsupported",
      sectionsDetected: 0,
      sectionsImported: 0,
      assetsDetected: 0,
      assetsImported: 0,
      assetsFailed: 0,
      missingAssets: [],
      unsupportedElements: [{ reason: "Unsupported WordPress JSON format." }],
      ctaDetected: 0,
      ctaConverted: 0,
      videosDetected: 0,
      testimonialsDetected: 0,
      status: "failed",
      errors: [
        "Unsupported WordPress format. Supported: Elementor, Gutenberg, Bricks, Generic WordPress JSON, and DigitalSkillX schema.",
      ],
      warnings: [],
    };
    return { report, salesPageId: "" };
  }

  const adapted = runAdapter(format, params.payload);
  const page = await getOrCreateSalesPage(params.admin, params.courseId, params.adminUserId);

  const { data: importRow } = await params.admin
    .from("sales_page_imports")
    .insert({
      sales_page_id: page.id,
      course_id: params.courseId,
      source_type: "json",
      source_format: format,
      status: "processing",
      created_by: params.adminUserId,
      report: {},
    } as never)
    .select("id")
    .single();

  const assetIds: string[] = [];
  const missingAssets: ImportReport["missingAssets"] = [];
  let assetsImported = 0;
  let assetsFailed = 0;
  const urls = adapted.assetUrls.slice(0, STORAGE_LIMITS.maxAssetsPerImport);

  for (const url of urls) {
    const downloaded = await downloadExternalAsset(url, params.fetchImpl);
    if (!downloaded.ok) {
      assetsFailed += 1;
      missingAssets.push({ url, reason: downloaded.reason });
      continue;
    }
    const stored = await storeAsset({
      admin: params.admin,
      storage: params.storage,
      salesPageId: page.id,
      courseId: params.courseId,
      body: downloaded.body,
      originalFilename: url.split("/").pop() || "asset.jpg",
      claimedMime: downloaded.contentType,
      sourceUrl: url,
    });
    if ("error" in stored) {
      assetsFailed += 1;
      missingAssets.push({ url, reason: stored.error });
      continue;
    }
    assetIds.push(stored.id);
    assetsImported += 1;
  }

  const schema = bindImageSections(adapted.schema, assetIds);
  const now = new Date().toISOString();
  await params.admin
    .from("sales_pages")
    .update({
      draft_schema: schema as never,
      draft_version: page.draft_version + 1,
      status: page.status === "published" ? "published" : "draft",
      title: page.title || params.courseTitle || "Sales page",
      updated_at: now,
    } as never)
    .eq("id", page.id);

  const report: ImportReport = {
    courseId: params.courseId,
    courseTitle: params.courseTitle,
    sourceType: "json",
    sourceFormat: format,
    sectionsDetected: adapted.schema.sections.length,
    sectionsImported: schema.sections.filter((s) => s.type !== "unsupported").length,
    assetsDetected: urls.length,
    assetsImported,
    assetsFailed,
    missingAssets,
    unsupportedElements: adapted.unsupported,
    ctaDetected: adapted.ctaDetected,
    ctaConverted: adapted.ctaConverted,
    videosDetected: adapted.videosDetected,
    testimonialsDetected: adapted.testimonialsDetected,
    status:
      adapted.unsupported.length || missingAssets.length
        ? "needs_attention"
        : "ready_for_review",
    errors: [],
    warnings: adapted.warnings,
  };

  if (importRow?.id) {
    await params.admin
      .from("sales_page_imports")
      .update({
        status: "completed",
        report: report as never,
        completed_at: now,
      } as never)
      .eq("id", importRow.id);
  }

  return { report, salesPageId: page.id };
}

export async function importSalesPageZip(params: {
  admin: SupabaseClient<Database>;
  storage: StorageService;
  courseId: string;
  courseTitle?: string;
  adminUserId: string;
  zipBytes: Uint8Array;
  fetchImpl?: typeof fetch;
}): Promise<{ report: ImportReport; salesPageId: string }> {
  const extracted = extractSalesPageZip(params.zipBytes);
  if (!extracted.ok) {
    return {
      salesPageId: "",
      report: {
        courseId: params.courseId,
        courseTitle: params.courseTitle,
        sourceType: "zip",
        sourceFormat: "unknown",
        sectionsDetected: 0,
        sectionsImported: 0,
        assetsDetected: 0,
        assetsImported: 0,
        assetsFailed: 0,
        missingAssets: [],
        unsupportedElements: [],
        ctaDetected: 0,
        ctaConverted: 0,
        videosDetected: 0,
        testimonialsDetected: 0,
        status: "failed",
        errors: [extracted.error],
        warnings: [],
      },
    };
  }

  const format = detectWordPressFormat(extracted.pageJson);
  if (format === "unsupported") {
    return {
      salesPageId: "",
      report: {
        courseId: params.courseId,
        courseTitle: params.courseTitle,
        sourceType: "zip",
        sourceFormat: "unsupported",
        sectionsDetected: 0,
        sectionsImported: 0,
        assetsDetected: extracted.assets.length,
        assetsImported: 0,
        assetsFailed: 0,
        missingAssets: [],
        unsupportedElements: [{ reason: "Unsupported page.json format inside ZIP." }],
        ctaDetected: 0,
        ctaConverted: 0,
        videosDetected: 0,
        testimonialsDetected: 0,
        status: "failed",
        errors: ["Unsupported WordPress format in page.json."],
        warnings: extracted.warnings,
      },
    };
  }

  const adapted = runAdapter(format, extracted.pageJson);
  const page = await getOrCreateSalesPage(params.admin, params.courseId, params.adminUserId);
  const assetIds: string[] = [];
  const missingAssets: ImportReport["missingAssets"] = [];
  let assetsImported = 0;
  let assetsFailed = 0;

  for (const file of extracted.assets.slice(0, STORAGE_LIMITS.maxAssetsPerImport)) {
    const body = Buffer.from(file.data);
    const stored = await storeAsset({
      admin: params.admin,
      storage: params.storage,
      salesPageId: page.id,
      courseId: params.courseId,
      body,
      originalFilename: file.path.split("/").pop() || "asset.bin",
      sourceUrl: null,
    });
    if ("error" in stored) {
      assetsFailed += 1;
      missingAssets.push({ reason: stored.error });
      continue;
    }
    assetIds.push(stored.id);
    assetsImported += 1;
  }

  // Still attempt remote URLs referenced in JSON but not bundled
  for (const url of adapted.assetUrls.slice(0, STORAGE_LIMITS.maxAssetsPerImport)) {
    if (assetsImported >= STORAGE_LIMITS.maxAssetsPerImport) break;
    const downloaded = await downloadExternalAsset(url, params.fetchImpl);
    if (!downloaded.ok) {
      assetsFailed += 1;
      missingAssets.push({ url, reason: downloaded.reason });
      continue;
    }
    const stored = await storeAsset({
      admin: params.admin,
      storage: params.storage,
      salesPageId: page.id,
      courseId: params.courseId,
      body: downloaded.body,
      originalFilename: url.split("/").pop() || "asset.jpg",
      claimedMime: downloaded.contentType,
      sourceUrl: url,
    });
    if ("error" in stored) {
      assetsFailed += 1;
      missingAssets.push({ url, reason: stored.error });
      continue;
    }
    assetIds.push(stored.id);
    assetsImported += 1;
  }

  const schema = bindImageSections(adapted.schema, assetIds);
  const now = new Date().toISOString();
  await params.admin
    .from("sales_pages")
    .update({
      draft_schema: schema as never,
      draft_version: page.draft_version + 1,
      updated_at: now,
      title: page.title || params.courseTitle || "Sales page",
    } as never)
    .eq("id", page.id);

  const report: ImportReport = {
    courseId: params.courseId,
    courseTitle: params.courseTitle,
    sourceType: "zip",
    sourceFormat: format,
    sectionsDetected: adapted.schema.sections.length,
    sectionsImported: schema.sections.filter((s: SalesPageSection) => s.type !== "unsupported").length,
    assetsDetected: extracted.assets.length + adapted.assetUrls.length,
    assetsImported,
    assetsFailed,
    missingAssets,
    unsupportedElements: adapted.unsupported,
    ctaDetected: adapted.ctaDetected,
    ctaConverted: adapted.ctaConverted,
    videosDetected: adapted.videosDetected,
    testimonialsDetected: adapted.testimonialsDetected,
    status: missingAssets.length || adapted.unsupported.length ? "needs_attention" : "ready_for_review",
    errors: [],
    warnings: [...extracted.warnings, ...adapted.warnings],
  };

  await params.admin.from("sales_page_imports").insert({
    sales_page_id: page.id,
    course_id: params.courseId,
    source_type: "zip",
    source_format: format,
    status: "completed",
    report: report as never,
    created_by: params.adminUserId,
    completed_at: now,
  } as never);

  return { report, salesPageId: page.id };
}
