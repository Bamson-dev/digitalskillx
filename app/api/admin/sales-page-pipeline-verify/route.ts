import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { verifyCronSecret } from "@/lib/cron-auth";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateSalesPage } from "@/lib/sales-pages/service";
import {
  createStorageAdapterFromEnv,
  resetStorageServiceCache,
  wrapStorageAdapter,
} from "@/lib/storage";
import { sha256Buffer } from "@/lib/storage/path-safety";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Minimal 1x1 PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * TEMPORARY Sales Page → Contabo pipeline verification.
 * Creates isolated temp course/page/asset, verifies Contabo + metadata, then deletes all.
 */
export async function POST(request: NextRequest) {
  const cron = verifyCronSecret(request);
  let adminUserId = "00000000-0000-4000-8000-000000000000";
  if (!cron.ok) {
    const auth = await requireAdminApiAuth({ lite: true });
    if ("error" in auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    adminUserId = auth.user.id;
  }

  const steps: Record<string, "PASS" | "FAIL" | "SKIPPED"> = {
    create_course: "SKIPPED",
    create_sales_page: "SKIPPED",
    contabo_upload: "SKIPPED",
    metadata_insert: "SKIPPED",
    contabo_download: "SKIPPED",
    content_match: "SKIPPED",
    cleanup_contabo: "SKIPPED",
    cleanup_db: "SKIPPED",
  };

  await bootstrapRuntimeSecrets();
  const session = createClient();
  const admin = await createAdminClientAsync(session);
  resetStorageServiceCache();
  const storage = wrapStorageAdapter(createStorageAdapterFromEnv());

  if (storage.provider !== "contabo-s3") {
    return NextResponse.json(
      { ok: false, error: `Expected contabo-s3, got ${storage.provider}` },
      { status: 500 },
    );
  }

  let courseId: string | null = null;
  let salesPageId: string | null = null;
  let assetId: string | null = null;
  let storagePath: string | null = null;

  try {
    const stamp = Date.now();
    const { data: course, error: courseErr } = await admin
      .from("courses")
      .insert({
        title: `__pipeline_verify_${stamp}__`,
        description: "Temporary Contabo sales-page pipeline verification course. Safe to delete.",
        visibility: "draft",
        is_published: false,
        price_ngn: 0,
        price_usd: 0,
        enrollment_type: "manual",
        certificate_enabled: false,
        required_completion_pct: 100,
        drip_enabled: false,
        tags: [],
        learning_outcomes: [],
        is_coming_soon: false,
      } as never)
      .select("id")
      .single();
    if (courseErr || !course) throw new Error(courseErr?.message ?? "course_create_failed");
    courseId = course.id as string;
    steps.create_course = "PASS";

    // Prefer a real admin profile id when cron-only
    if (cron.ok) {
      const { data: adminProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();
      if (adminProfile?.id) adminUserId = adminProfile.id;
    }

    const page = await getOrCreateSalesPage(admin, courseId, adminUserId);
    salesPageId = page.id;
    steps.create_sales_page = "PASS";

    assetId = randomUUID();
    storagePath = `sales-page-assets/${courseId}/${assetId}-probe.png`;
    const uploaded = await storage.upload({
      path: storagePath,
      body: TINY_PNG,
      contentType: "image/png",
      isPublic: true,
    });
    steps.contabo_upload = "PASS";

    const { error: assetErr } = await admin.from("sales_page_assets").insert({
      id: assetId,
      sales_page_id: salesPageId,
      course_id: courseId,
      filename: `${assetId}-probe.png`,
      original_filename: "probe.png",
      mime_type: "image/png",
      size_bytes: uploaded.size,
      storage_provider: uploaded.provider,
      storage_path: uploaded.path,
      public_url: `/api/sales-page-assets/${assetId}`,
      checksum: sha256Buffer(TINY_PNG),
      source_url: null,
      status: "active",
    } as never);
    if (assetErr) throw new Error(assetErr.message);
    steps.metadata_insert = "PASS";

    const downloaded = await storage.download(storagePath);
    steps.contabo_download = "PASS";
    steps.content_match = Buffer.compare(downloaded, TINY_PNG) === 0 ? "PASS" : "FAIL";
    if (steps.content_match === "FAIL") throw new Error("Pipeline content mismatch.");

    await storage.delete(storagePath);
    storagePath = null;
    steps.cleanup_contabo = (await storage.exists(`sales-page-assets/${courseId}/${assetId}-probe.png`))
      ? "FAIL"
      : "PASS";

    await admin.from("sales_page_assets").delete().eq("id", assetId);
    await admin.from("sales_pages").delete().eq("id", salesPageId);
    await admin.from("courses").delete().eq("id", courseId);
    courseId = null;
    salesPageId = null;
    assetId = null;
    steps.cleanup_db = "PASS";

    return NextResponse.json({
      ok: true,
      provider: storage.provider,
      steps,
      leftoverCourseId: null,
      leftoverAssetPath: null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // best-effort cleanup
    try {
      if (storagePath) await storage.delete(storagePath);
    } catch {
      /* ignore */
    }
    try {
      if (assetId) await admin.from("sales_page_assets").delete().eq("id", assetId);
      if (salesPageId) await admin.from("sales_pages").delete().eq("id", salesPageId);
      if (courseId) await admin.from("courses").delete().eq("id", courseId);
    } catch {
      /* ignore */
    }

    return NextResponse.json(
      {
        ok: false,
        steps,
        leftoverCourseId: courseId,
        leftoverAssetPath: storagePath,
        error: (err instanceof Error ? err.message : "pipeline_verify_failed").replace(
          /[A-Za-z0-9/+]{24,}/g,
          "[REDACTED]",
        ),
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
