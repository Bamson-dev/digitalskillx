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
import { runtimeEnv } from "@/lib/runtime-env";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { secureLog } from "@/lib/secure-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function cronSecretMatches(request: NextRequest) {
  const secret = (runtimeEnv("CRON_SECRET") ?? process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

async function authorize(request: NextRequest) {
  if (cronSecretMatches(request)) return { ok: true as const };

  const headerKey = request.headers.get("x-admin-key");
  if (getAdminApiKey() && adminApiKeyMatches(headerKey)) return { ok: true as const };

  const session = await requireAdminApiAuth({ lite: true });
  if (!("error" in session)) return { ok: true as const };

  return {
    ok: false as const,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}

function keepAlive<T>(promise: Promise<T>) {
  // Coolify/Node: keep work alive after Traefik gets the 202 response.
  promise.catch((err) => {
    secureLog("error", "paystack/refulfill", "background_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * POST { "reference": "...", "verified"?: {...}, "forceEmail"?: true, "async"?: true }
 * POST { "backfill": true, "perPage": 50, "limit": 10, "forceEmail"?: true, "async"?: true }
 *
 * GET ?reference=... — check fulfillment status for a Paystack reference
 */
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;

  const reference = (request.nextUrl.searchParams.get("reference") ?? "").trim();
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  const admin = await createAdminClientAsync();
  const { data: tx } = await admin
    .from("transactions")
    .select("reference, status, student_id, course_id, amount, currency, paystack_data, updated_at")
    .eq("reference", reference)
    .maybeSingle();

  if (!tx) {
    return NextResponse.json({ found: false, reference });
  }

  const pd =
    tx.paystack_data && typeof tx.paystack_data === "object"
      ? (tx.paystack_data as Record<string, unknown>)
      : {};

  let enrolled = false;
  if (tx.student_id && tx.course_id) {
    const { data: enrollment } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", tx.student_id)
      .eq("course_id", tx.course_id)
      .maybeSingle();
    enrolled = Boolean(enrollment);
  }

  return NextResponse.json({
    found: true,
    reference: tx.reference,
    status: tx.status,
    amount: tx.amount,
    currency: tx.currency,
    studentId: tx.student_id,
    courseId: tx.course_id,
    enrolled,
    fulfillmentStatus: pd.fulfillment_status ?? null,
    fulfillmentError: pd.fulfillment_error ?? null,
    accessEmailSentAt: pd.access_email_sent_at ?? null,
    customerEmail: pd.customer_email ?? pd.checkout_email ?? null,
    updatedAt: tx.updated_at,
  });
}

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
  // Default async when a verified override is provided — Contabo→Paystack/Resend can exceed Traefik's ~60s.
  const useAsync = body.async === true || (body.async !== false && body.verified != null);

  if (body.backfill === true) {
    const perPage = typeof body.perPage === "number" ? body.perPage : 50;
    const limit = typeof body.limit === "number" ? body.limit : 10;
    const work = backfillRecentAiAppPayments({
      perPage,
      limit,
      forceEmail: body.forceEmail === true,
    });

    if (useAsync || body.async === true) {
      keepAlive(work);
      return NextResponse.json(
        { accepted: true, mode: "backfill", limit, forceEmail: body.forceEmail === true },
        { status: 202 },
      );
    }

    const result = await work;
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  }

  const reference = typeof body.reference === "string" ? body.reference : "";
  const work = refulfillPaystackExternalByReference(reference, {
    verifiedOverride: body.verified,
    forceEmail: body.forceEmail === true,
  });

  if (useAsync) {
    keepAlive(
      work.then((result) => {
        secureLog("info", "paystack/refulfill", "background_done", {
          reference,
          ok: result.ok,
          alreadyFulfilled: "alreadyFulfilled" in result ? result.alreadyFulfilled : undefined,
          error: "error" in result ? result.error : undefined,
        });
      }),
    );
    return NextResponse.json(
      {
        accepted: true,
        reference,
        forceEmail: body.forceEmail === true,
        message: "Fulfillment started in background. Poll GET ?reference=...",
      },
      { status: 202 },
    );
  }

  const result = await work;
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
    message: result.alreadyFulfilled
      ? "Payment was already fulfilled; access email resent if needed."
      : "Payment fulfilled: course access granted and access email sent.",
    ...result,
  });
}
