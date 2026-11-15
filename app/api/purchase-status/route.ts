import { NextResponse, type NextRequest } from "next/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/org";
import { secureLog } from "@/lib/secure-log";
import { computePurchaseStatus, isValidPurchaseReference } from "@/lib/purchase-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * GET /api/purchase-status?reference=<paystack reference>
 *
 * Read-only. Used by the post-payment page to show real fulfilment state.
 * Reports "paid" only for a transaction the server already verified and
 * enrolled. Never trusts the browser. Returns no personal data.
 */
export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference")?.trim() ?? "";
  if (!isValidPurchaseReference(reference)) {
    return NextResponse.json({ error: "Invalid reference" }, { status: 400, headers: NO_STORE });
  }

  try {
    const admin = await createAdminClientAsync();
    const { data: transaction } = await admin
      .from("transactions")
      .select("status, student_id, course_id, paystack_data")
      .eq("reference", reference)
      .maybeSingle();

    let enrolled = false;
    if (transaction?.student_id && transaction.course_id) {
      const { data: enrollment } = await admin
        .from("enrollments")
        .select("id")
        .eq("student_id", transaction.student_id)
        .eq("course_id", transaction.course_id)
        .maybeSingle();
      enrolled = Boolean(enrollment);
    }

    const result = computePurchaseStatus({
      transaction: transaction
        ? {
            status: transaction.status,
            course_id: transaction.course_id,
            paystack_data: transaction.paystack_data,
          }
        : null,
      enrolled,
      siteBaseUrl: siteUrl(),
    });

    return NextResponse.json(result, { status: 200, headers: NO_STORE });
  } catch (err) {
    secureLog("error", "purchase-status", "lookup_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // The caller treats this as "still confirming". It never reads as success.
    return NextResponse.json({ error: "Status unavailable" }, { status: 503, headers: NO_STORE });
  }
}
