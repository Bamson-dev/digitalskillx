import { NextResponse, type NextRequest } from "next/server";
import {
  adminApiKeyMatches,
  getAdminApiKey,
} from "@/lib/manual-purchase-tracking";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import {
  backfillRecentAiAppPayments,
  refulfillPaystackExternalByReference,
} from "@/lib/paystack-external-refulfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorize(request: NextRequest) {
  const headerKey = request.headers.get("x-admin-key");
  if (getAdminApiKey() && adminApiKeyMatches(headerKey)) return { ok: true as const };

  const session = await requireAdminApiAuth({ lite: true });
  if (!("error" in session)) return { ok: true as const };

  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

/**
 * POST { "reference": "..." } — fulfill one payment
 * POST { "backfill": true, "perPage": 50 } — scan recent Paystack successes at ₦14,999 and fulfill
 */
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const body = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (body.backfill === true) {
    const perPage = typeof body.perPage === "number" ? body.perPage : 50;
    const result = await backfillRecentAiAppPayments({ perPage });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  }

  const reference = typeof body.reference === "string" ? body.reference : "";
  const result = await refulfillPaystackExternalByReference(reference);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        reference: "reference" in result ? result.reference : reference,
        amount: "amount" in result ? result.amount : undefined,
        currency: "currency" in result ? result.currency : undefined,
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    message: result.alreadyFulfilled
      ? "Payment was already fulfilled; access email resent if needed."
      : "Payment fulfilled: course access granted and access email sent.",
    ...result,
  });
}
