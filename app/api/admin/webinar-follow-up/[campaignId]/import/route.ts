import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { logAudit } from "@/lib/audit";
import { keepWebinarFollowupSending } from "@/lib/bulk-import-continue";
import { MAX_CSV_BYTES, type CampaignStatus } from "@/lib/webinar-followup/constants";
import {
  extractContactsFromCsv,
  parseCsvMatrix,
} from "@/lib/webinar-followup/csv";
import { importNewContactsOneShot, loadCampaignSnapshot, loadCampaignCounts } from "@/lib/webinar-followup/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * One-action CSV import: parse → dedupe → skip existing/suppressed → enroll new only.
 * No dry-run confirmation required.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const limited = await rateLimitedResponse(request, "admin-wfu-import", 15);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  const snapshot = await loadCampaignSnapshot(auth.admin, params.campaignId);
  if (!snapshot.campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (snapshot.campaign.status === "archived") {
    return NextResponse.json(
      { error: "Campaign is archived. Restore it before importing." },
      { status: 409 },
    );
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "CSV file required." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "CSV exceeds 5MB limit." }, { status: 400 });
  }

  const raw = await file.text();
  const emailColumn = String(form.get("email_column") ?? "").trim() || null;
  const firstNameColumn = String(form.get("first_name_column") ?? "").trim() || null;
  const { headers, rows } = parseCsvMatrix(raw);
  const extracted = extractContactsFromCsv({ raw, emailColumn, firstNameColumn });

  if (!extracted.guess.emailColumn && !emailColumn) {
    return NextResponse.json(
      {
        error: "Could not detect an email column. Choose the email column and try again.",
        headers,
        guess: extracted.guess,
      },
      { status: 400 },
    );
  }

  const result = await importNewContactsOneShot({
    admin: auth.admin,
    campaignId: params.campaignId,
    fileName: file.name || "upload.csv",
    uploadedBy: auth.profile.id,
    totalRows: rows.length,
    contacts: extracted.contacts,
    invalidCount: extracted.invalidRows.length,
    duplicatesInFile: extracted.duplicatesInFile,
    campaignStatus: snapshot.campaign.status as CampaignStatus,
  });

  await logAudit({
    action: "webinar_followup_import",
    targetType: "webinar_followup_campaign",
    targetId: params.campaignId,
    metadata: {
      importId: result.importId,
      enrolled: result.enrolled,
      skippedExisting: result.skippedExisting,
      skippedSuppressed: result.skippedSuppressed,
    },
  });

  // If campaign is active and new contacts are due for Email 1, drain via continuation.
  if (snapshot.campaign.status === "active" && result.enrolled > 0) {
    keepWebinarFollowupSending({
      moreDue: true,
      depth: 0,
      reason: "wfu_import_new_contacts",
    });
  }

  const counts = await loadCampaignCounts(auth.admin, params.campaignId);

  return NextResponse.json({
    ok: true,
    message: "Import complete",
    guess: extracted.guess,
    headers,
    totalRows: rows.length,
    validEmails: extracted.contacts.length,
    invalidEmails: result.skippedInvalid,
    duplicatesInFile: result.duplicatesInFile,
    existingSkipped: result.skippedExisting,
    suppressedSkipped: result.skippedSuppressed,
    newlyAdded: result.enrolled,
    counts: {
      total: counts.total,
      active: counts.active,
      completed: counts.completed,
      unsubscribed: counts.unsubscribed,
      failed: counts.failed,
      dueNow: counts.dueNow,
      waiting: counts.waiting,
    },
  });
}
