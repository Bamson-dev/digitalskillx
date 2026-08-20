import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getStorageService } from "@/lib/storage";
import { ALLOWED_IMAGE_MIME } from "@/lib/storage/limits";
import { siteUrl } from "@/lib/org";
import {
  LANDING_IMPORT_LIMITS,
  type DetectedCta,
  type LandingImportReport,
  type LandingDestinationType,
} from "./constants";
import { detectAnchorCtas, applyCtaRewrites, resolveDestinationUrl, isAllowedRewriteDestination } from "./cta";
import { assertLandingSlug, normalizeLandingSlug } from "./reserved-slugs";
import { fetchPublicUrl, normalizeSourceUrl, validatePublicHttpUrl } from "./ssrf";
import {
  absolutizeRelativeUrls,
  collectAssetUrls,
  extractBodyHtml,
  extractDocumentTitle,
  extractInlineAndLinkedStylesheetHrefs,
  extractInlineStyleBlocks,
  rewriteAssetUrls,
  sanitizeCss,
  sanitizeLandingHtml,
} from "./sanitize";

type Admin = SupabaseClient<Database>;

function emptyReport(): LandingImportReport {
  return {
    title: "",
    assetsDetected: 0,
    assetsImported: 0,
    assetsSkipped: 0,
    assetsBlocked: 0,
    assetsFailed: 0,
    stylesheetsInlined: 0,
    ctasDetected: 0,
    ctasMarkedConversion: 0,
    warnings: [],
    blocked: [],
    unsupported: [],
  };
}

function isAllowedAssetMime(mime: string): boolean {
  if (ALLOWED_IMAGE_MIME.has(mime)) return true;
  if (mime === "image/svg+xml") return false; // reject SVG assets by default (XSS)
  if (mime === "font/woff" || mime === "font/woff2" || mime === "application/font-woff") return true;
  return false;
}

export async function runUrlLandingImport(params: {
  admin: Admin;
  sourceUrl: string;
  slug: string;
  destinationType: LandingDestinationType;
  destinationCourseId?: string | null;
  destinationUrl?: string | null;
  importedBy: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; pageId: string; report: LandingImportReport; ctas: DetectedCta[] }
  | { ok: false; error: string; pageId?: string }
> {
  const slugCheck = assertLandingSlug(params.slug);
  if (!slugCheck.ok) return { ok: false, error: slugCheck.error };

  const urlCheck = validatePublicHttpUrl(params.sourceUrl);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.reason };

  const destinationHref = resolveDestinationUrl({
    destinationType: params.destinationType,
    destinationUrl: params.destinationUrl,
    courseId: params.destinationCourseId,
    siteOrigin: siteUrl(),
  });
  if (!destinationHref) {
    return { ok: false, error: "Choose a valid DigitalSkillX destination before importing." };
  }

  const report = emptyReport();
  const sourceNormalized = normalizeSourceUrl(params.sourceUrl);

  const { data: created, error: createErr } = await params.admin
    .from("imported_landing_pages" as never)
    .insert({
      source_url: params.sourceUrl.trim(),
      source_url_normalized: sourceNormalized,
      title: "",
      slug: slugCheck.slug,
      status: "importing",
      destination_type: params.destinationType,
      destination_course_id: params.destinationCourseId ?? null,
      destination_url: destinationHref,
      imported_by: params.importedBy,
      import_report: report,
    } as never)
    .select("id")
    .maybeSingle();

  if (createErr || !created) {
    const msg = createErr?.message ?? "Could not create import record.";
    if (/unique|duplicate/i.test(msg)) return { ok: false, error: "That slug is already in use." };
    if (/does not exist|schema cache/i.test(msg)) {
      return { ok: false, error: "Apply migration 0047_imported_landing_pages.sql before importing." };
    }
    return { ok: false, error: msg };
  }

  const pageId = String((created as { id: string }).id);

  try {
    const htmlFetch = await fetchPublicUrl(params.sourceUrl, {
      maxBytes: LANDING_IMPORT_LIMITS.maxHtmlBytes,
      accept: "text/html,application/xhtml+xml",
      fetchImpl: params.fetchImpl,
    });
    if (!htmlFetch.ok) {
      await markFailed(params.admin, pageId, htmlFetch.reason, report);
      return { ok: false, error: htmlFetch.reason, pageId };
    }
    if (!/html|xml/i.test(htmlFetch.contentType) && !htmlFetch.body.toString("utf8").includes("<html")) {
      report.warnings.push(`Unexpected content-type: ${htmlFetch.contentType}`);
    }

    const rawHtml = htmlFetch.body.toString("utf8");
    const baseUrl = htmlFetch.finalUrl;
    const title = extractDocumentTitle(rawHtml) || slugCheck.slug;
    report.title = title;

    let css = sanitizeCss(extractInlineStyleBlocks(rawHtml));
    const sheetHrefs = extractInlineAndLinkedStylesheetHrefs(rawHtml, baseUrl).slice(
      0,
      LANDING_IMPORT_LIMITS.maxStylesheets,
    );
    for (const href of sheetHrefs) {
      const sheet = await fetchPublicUrl(href, {
        maxBytes: LANDING_IMPORT_LIMITS.maxCssBytes,
        accept: "text/css,*/*",
        fetchImpl: params.fetchImpl,
      });
      if (!sheet.ok) {
        report.warnings.push(`Stylesheet skipped: ${href} (${sheet.reason})`);
        continue;
      }
      css += `\n/* ${href} */\n` + sanitizeCss(sheet.body.toString("utf8"));
      report.stylesheetsInlined += 1;
    }

    let body = extractBodyHtml(rawHtml);
    body = absolutizeRelativeUrls(body, baseUrl);
    body = sanitizeLandingHtml(body, LANDING_IMPORT_LIMITS.maxHtmlBytes);

    const assetUrls = collectAssetUrls(body + "\n" + css, baseUrl).slice(0, LANDING_IMPORT_LIMITS.maxAssets);
    report.assetsDetected = assetUrls.length;

    const rewriteMap = new Map<string, string>();
    let totalBytes = 0;
    const storage = getStorageService();

    for (const assetUrl of assetUrls) {
      if (totalBytes >= LANDING_IMPORT_LIMITS.maxTotalAssetBytes) {
        report.assetsSkipped += 1;
        report.warnings.push("Stopped mirroring assets: total size budget reached.");
        break;
      }
      const downloaded = await fetchPublicUrl(assetUrl, {
        maxBytes: LANDING_IMPORT_LIMITS.maxAssetBytes,
        fetchImpl: params.fetchImpl,
      });
      if (!downloaded.ok) {
        if (/Private|not allowed|metadata|localhost/i.test(downloaded.reason)) {
          report.assetsBlocked += 1;
          report.blocked.push(`${assetUrl}: ${downloaded.reason}`);
        } else {
          report.assetsFailed += 1;
          report.warnings.push(`${assetUrl}: ${downloaded.reason}`);
        }
        continue;
      }
      if (!isAllowedAssetMime(downloaded.contentType)) {
        report.assetsBlocked += 1;
        report.blocked.push(`${assetUrl}: blocked type ${downloaded.contentType}`);
        continue;
      }
      totalBytes += downloaded.body.byteLength;
      const checksum = createHash("sha256").update(downloaded.body).digest("hex");
      const ext = extFromMime(downloaded.contentType);
      const filename = `${checksum.slice(0, 16)}.${ext}`;
      const storagePath = `landing-import/${pageId}/${filename}`;
      const uploaded = await storage.upload({
        path: storagePath,
        body: downloaded.body,
        contentType: downloaded.contentType,
        isPublic: true,
      });
      const publicUrl = `/api/landing-assets/${pageId}/${filename}`;
      await params.admin.from("imported_landing_page_assets" as never).insert({
        page_id: pageId,
        original_url: assetUrl,
        storage_provider: uploaded.provider,
        storage_path: uploaded.path,
        public_url: publicUrl,
        content_type: downloaded.contentType,
        size_bytes: downloaded.body.byteLength,
        checksum: uploaded.checksumSha256 || checksum,
        status: "active",
      } as never);
      rewriteMap.set(assetUrl, publicUrl);
      report.assetsImported += 1;
    }

    body = rewriteAssetUrls(body, rewriteMap);
    css = rewriteAssetUrls(css, rewriteMap);

    const ctas = detectAnchorCtas(body);
    for (const cta of ctas) {
      if (cta.rewrite) cta.mappedHref = destinationHref;
    }
    report.ctasDetected = ctas.length;
    report.ctasMarkedConversion = ctas.filter((c) => c.rewrite).length;
    body = applyCtaRewrites(body, ctas, destinationHref, siteUrl());

    if (/<script|analytics|gtag|fbq|payment/i.test(rawHtml)) {
      report.unsupported.push("Source-page scripts were removed for security (static import only).");
    }

    const sourceHash = createHash("sha256").update(rawHtml).digest("hex");
    const { error: updateErr } = await params.admin
      .from("imported_landing_pages" as never)
      .update({
        title,
        status: "review",
        draft_html: body,
        draft_css: css,
        source_hash: sourceHash,
        cta_map: ctas,
        import_report: report,
        import_error: null,
        page_metadata: {
          finalSourceUrl: baseUrl,
          contentType: htmlFetch.contentType,
        },
      } as never)
      .eq("id", pageId);

    if (updateErr) {
      await markFailed(params.admin, pageId, updateErr.message, report);
      return { ok: false, error: updateErr.message, pageId };
    }

    return { ok: true, pageId, report, ctas };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed.";
    await markFailed(params.admin, pageId, message, report);
    return { ok: false, error: message, pageId };
  }
}

async function markFailed(
  admin: Admin,
  pageId: string,
  error: string,
  report: LandingImportReport,
) {
  await admin
    .from("imported_landing_pages" as never)
    .update({
      status: "failed",
      import_error: error,
      import_report: report,
    } as never)
    .eq("id", pageId);
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "font/woff2":
      return "woff2";
    case "font/woff":
      return "woff";
    default:
      return "bin";
  }
}

export async function publishImportedLandingPage(admin: Admin, pageId: string) {
  const { data, error } = await admin
    .from("imported_landing_pages" as never)
    .select("id, status, draft_html, draft_css, slug")
    .eq("id", pageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Page not found.");
  const row = data as {
    status: string;
    draft_html: string;
    draft_css: string;
    slug: string;
  };
  if (row.status === "archived") throw new Error("Archived pages cannot be published.");
  if (!row.draft_html.trim()) throw new Error("Nothing to publish — re-import first.");
  const slugOk = assertLandingSlug(row.slug);
  if (!slugOk.ok) throw new Error(slugOk.error);

  const { error: upErr } = await admin
    .from("imported_landing_pages" as never)
    .update({
      status: "published",
      published_html: row.draft_html,
      published_css: row.draft_css,
      published_at: new Date().toISOString(),
    } as never)
    .eq("id", pageId);
  if (upErr) throw new Error(upErr.message);
}

export async function unpublishImportedLandingPage(admin: Admin, pageId: string) {
  const { error } = await admin
    .from("imported_landing_pages" as never)
    .update({
      status: "review",
      published_at: null,
      // Keep draft; clear public payload so RLS/status mistakes cannot leak prior publish.
      published_html: null,
      published_css: null,
    } as never)
    .eq("id", pageId);
  if (error) throw new Error(error.message);
}

export async function updateLandingCtaMap(
  admin: Admin,
  pageId: string,
  ctas: DetectedCta[],
  destinationHref: string | null,
) {
  const origin = siteUrl();
  const safeDefault =
    destinationHref && isAllowedRewriteDestination(destinationHref, origin) ? destinationHref : null;
  const safeCtas = ctas.map((cta) => {
    const mapped =
      cta.mappedHref && isAllowedRewriteDestination(cta.mappedHref, origin) ? cta.mappedHref : safeDefault;
    return { ...cta, mappedHref: cta.rewrite ? mapped : null };
  });

  const { data, error } = await admin
    .from("imported_landing_pages" as never)
    .select("draft_html")
    .eq("id", pageId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Page not found.");
  let html = String((data as { draft_html: string }).draft_html ?? "");
  html = applyCtaRewrites(html, safeCtas, safeDefault, origin);
  const { error: upErr } = await admin
    .from("imported_landing_pages" as never)
    .update({
      cta_map: safeCtas,
      draft_html: html,
      status: "review",
    } as never)
    .eq("id", pageId);
  if (upErr) throw new Error(upErr.message);
}

export { normalizeLandingSlug, assertLandingSlug };
