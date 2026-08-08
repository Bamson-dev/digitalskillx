import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getStorageService } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * TEMPORARY: delete an E2E acceptance test course + Contabo sales-page assets.
 * Auth: CRON_SECRET bearer OR admin session.
 * Only allows courses whose title starts with "Phase1 Acc UI" or "E2E test course".
 * Remove after Phase 1 UI acceptance.
 */
export async function POST(request: NextRequest) {
  const cron = verifyCronSecret(request);
  if (!cron.ok) {
    const auth = await requireAdminApiAuth({ lite: true });
    if ("error" in auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { courseId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const courseId = String(body.courseId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(courseId)) {
    return NextResponse.json({ error: "Invalid courseId." }, { status: 400 });
  }

  try {
    await bootstrapRuntimeSecrets();
    const session = createClient();
    const admin = await createAdminClientAsync(session);

    const { data: course } = await admin
      .from("courses")
      .select("id, title")
      .eq("id", courseId)
      .maybeSingle();

    if (!course) {
      return NextResponse.json({ ok: true, alreadyGone: true });
    }
    if (!/^(Phase1 Acc UI|E2E test course)/i.test(String(course.title ?? ""))) {
      return NextResponse.json(
        { error: "Refusing to delete: title must start with 'Phase1 Acc UI' or 'E2E test course'." },
        { status: 403 },
      );
    }

    const { data: assets } = await admin
      .from("sales_page_assets")
      .select("id, storage_path")
      .eq("course_id", courseId);

    const storage = getStorageService();
    const deletedPaths: string[] = [];
    const failedPaths: string[] = [];
    for (const asset of assets ?? []) {
      const path = String(asset.storage_path ?? "");
      if (!path) continue;
      try {
        await storage.delete(path);
        deletedPaths.push(path);
      } catch {
        failedPaths.push(path);
      }
    }

    const { error } = await admin.from("courses").delete().eq("id", courseId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, deletedPaths: deletedPaths.length, failedPaths: failedPaths.length },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      courseId,
      assetsFound: (assets ?? []).length,
      contaboDeleted: deletedPaths.length,
      contaboDeleteFailed: failedPaths.length,
      // Do not return storage paths (may contain internal keys)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cleanup failed.";
    console.error("[sales-page-ui-cleanup]", message);
    return NextResponse.json({ ok: false, error: "Cleanup failed." }, { status: 500 });
  }
}
