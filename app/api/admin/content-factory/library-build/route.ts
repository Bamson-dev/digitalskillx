import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import type { Json } from "@/types/database";
import { logAudit } from "@/lib/audit";
import { keepContentFactoryRunning } from "@/lib/bulk-import-continue";
import {
  getLibraryBuildStatus,
  pauseLibraryBuild,
  resumeLibraryBuild,
  startLibraryBuild,
  stopLibraryBuild,
  updateLibraryBuildSettings,
} from "@/lib/content-factory/library-build/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function kickCron() {
  keepContentFactoryRunning({ moreWork: true, depth: 0, reason: "library_build_admin_kick" });
}

export async function GET() {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  try {
    const status = await getLibraryBuildStatus(auth.admin);
    const { data: activity } = await auth.admin
      .from("library_build_activity")
      .select("id, kind, message, details, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    const { data: categories } = await auth.admin
      .from("library_build_categories")
      .select("id, slug, name, active, priority_weight, minimum_coverage_goal, preferred_target, sort_order")
      .order("sort_order");
    const { data: jobs } = await auth.admin
      .from("library_build_discovery_jobs")
      .select("id, mode, status, candidates_found, candidates_rejected, candidates_approved, error_message, created_at, completed_at")
      .order("created_at", { ascending: false })
      .limit(20);
    return NextResponse.json({ status, activity: activity ?? [], categories: categories ?? [], jobs: jobs ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load library build status" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!contentFactoryEnabled()) {
    return NextResponse.json({ error: "Content Factory disabled.", code: "FEATURE_DISABLED" }, { status: 403 });
  }
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const limited = await rateLimitedResponse(request, "admin-library-build", 30, 60_000);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = String(body.action ?? "").trim();
  try {
    let status;
    switch (action) {
      case "start":
        status = await startLibraryBuild(auth.admin, auth.user.id);
        await logAudit({
          action: "library_build_start",
          targetType: "library_build_settings",
          targetId: "default",
        });
        kickCron();
        break;
      case "pause":
        status = await pauseLibraryBuild(auth.admin, auth.user.id);
        await logAudit({ action: "library_build_pause", targetType: "library_build_settings", targetId: "default" });
        break;
      case "resume":
        status = await resumeLibraryBuild(auth.admin, auth.user.id);
        await logAudit({ action: "library_build_resume", targetType: "library_build_settings", targetId: "default" });
        kickCron();
        break;
      case "tick":
        {
          const { runLibraryBuildThroughputTick } = await import(
            "@/lib/content-factory/library-build/throughput-pipeline"
          );
          const { getLibraryBuildStatus: refresh } = await import(
            "@/lib/content-factory/library-build/engine"
          );
          const tick = await runLibraryBuildThroughputTick(auth.admin);
          status = await refresh(auth.admin);
          await logAudit({
            action: "library_build_tick",
            targetType: "library_build_settings",
            targetId: "default",
            metadata: {
              throughput: tick as Json,
            },
          });
          if (status?.runStatus === "running" || (tick.discoveryBacklog.created ?? 0) > 0) kickCron();
          return NextResponse.json({ ok: true, status, tick });
        }
      case "stop":
        status = await stopLibraryBuild(auth.admin, auth.user.id);
        await logAudit({ action: "library_build_stop", targetType: "library_build_settings", targetId: "default" });
        break;
      case "update_settings":
        status = await updateLibraryBuildSettings(auth.admin, auth.user.id, {
          targetPublishedCount:
            body.targetPublishedCount != null ? Number(body.targetPublishedCount) : undefined,
          qualityThreshold: body.qualityThreshold != null ? Number(body.qualityThreshold) : undefined,
          discoveryJobsPerDay:
            body.discoveryJobsPerDay != null ? Number(body.discoveryJobsPerDay) : undefined,
          maintenanceMaxPerWeek:
            body.maintenanceMaxPerWeek != null ? Number(body.maintenanceMaxPerWeek) : undefined,
          discoveryBacklogTarget:
            body.discoveryBacklogTarget != null ? Number(body.discoveryBacklogTarget) : undefined,
        });
        await logAudit({
          action: "library_build_settings_update",
          targetType: "library_build_settings",
          targetId: "default",
          metadata: {
            targetPublishedCount:
              body.targetPublishedCount != null ? Number(body.targetPublishedCount) : null,
            qualityThreshold: body.qualityThreshold != null ? Number(body.qualityThreshold) : null,
            discoveryJobsPerDay:
              body.discoveryJobsPerDay != null ? Number(body.discoveryJobsPerDay) : null,
            maintenanceMaxPerWeek:
              body.maintenanceMaxPerWeek != null ? Number(body.maintenanceMaxPerWeek) : null,
          } as Json,
        });
        if (status?.runStatus === "running") kickCron();
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Library build action failed" },
      { status: 500 },
    );
  }
}
