import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { MAX_CSV_BYTES } from "@/lib/webinar-followup/constants";
import {
  buildDryRunReport,
  extractContactsFromCsv,
  parseCsvMatrix,
} from "@/lib/webinar-followup/csv";
import { listCampaignEmails, listSuppressedEmails } from "@/lib/webinar-followup/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Optional preview only — does not enroll contacts. Main import is POST .../import */
export async function POST(
  request: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const limited = await rateLimitedResponse(request, "admin-wfu-import-preview", 30);
  if (limited) return limited;

  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;

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
        error: "Could not detect an email column. Map it manually.",
        headers,
        guess: extracted.guess,
      },
      { status: 400 },
    );
  }

  const emails = extracted.contacts.map((c) => c.normalizedEmail);
  const [already, suppressed] = await Promise.all([
    listCampaignEmails(auth.admin, params.campaignId, emails),
    listSuppressedEmails(auth.admin, emails),
  ]);

  const report = buildDryRunReport({
    totalRows: rows.length,
    contacts: extracted.contacts,
    invalidCount: extracted.invalidRows.length,
    duplicatesInFile: extracted.duplicatesInFile,
    alreadyInCampaign: already,
    suppressed,
  });

  return NextResponse.json({
    ok: true,
    previewOnly: true,
    guess: extracted.guess,
    headers,
    report,
  });
}
