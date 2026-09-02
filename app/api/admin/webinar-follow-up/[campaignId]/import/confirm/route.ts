import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { MAX_CSV_BYTES } from "@/lib/webinar-followup/constants";
import { extractContactsFromCsv } from "@/lib/webinar-followup/csv";
import { scheduleWebinarFollowupDrain } from "@/lib/webinar-followup/live-drain";
import { confirmImportEnrollment, loadCampaignSnapshot } from "@/lib/webinar-followup/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const limited = await rateLimitedResponse(request, "admin-wfu-import-confirm", 10);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const form = await request.formData();
  const importId = String(form.get("import_id") ?? "").trim();
  const file = form.get("file");
  if (!importId) {
    return NextResponse.json({ error: "import_id required from dry-run." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV exceeds 5MB limit." }, { status: 400 });
  }

  const { data: importRow, error } = await auth.admin
    .from("webinar_followup_imports" as never)
    .select("id, campaign_id, status")
    .eq("id", importId)
    .eq("campaign_id", params.campaignId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!importRow) return NextResponse.json({ error: "Import not found." }, { status: 404 });
  if ((importRow as { status: string }).status !== "dry_run") {
    return NextResponse.json({ error: "Import already confirmed or cancelled." }, { status: 409 });
  }

  const raw = await file.text();
  const emailColumn = String(form.get("email_column") ?? "").trim() || null;
  const firstNameColumn = String(form.get("first_name_column") ?? "").trim() || null;
  const extracted = extractContactsFromCsv({ raw, emailColumn, firstNameColumn });

  const result = await confirmImportEnrollment({
    admin: auth.admin,
    importId,
    campaignId: params.campaignId,
    contacts: extracted.contacts,
  });

  const campaign = await loadCampaignSnapshot(auth.admin, params.campaignId);
  if (campaign.campaign?.status === "active" && result.enrolled > 0) {
    scheduleWebinarFollowupDrain(auth.admin, {
      campaignId: params.campaignId,
      reason: "wfu_import_confirm",
    });
  }

  await logAudit({
    action: "webinar_followup_import_confirm",
    targetType: "webinar_followup_campaign",
    targetId: params.campaignId,
    metadata: { importId, enrolled: result.enrolled, skipped: result.skipped },
  });

  return NextResponse.json({ ok: true, ...result });
}
